import type { LoggerService } from '@backstage/backend-plugin-api';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type { KlausSourceConfig } from './config';
import {
  type GithubContentEntry,
  githubFetch,
  resolveDefaultBranch,
} from './githubFetch';

const KLAUS_DIR_PREFIX = 'klaus-';

export interface DiscoveredToolchain {
  name: string;
  dirName: string;
  source: KlausSourceConfig;
  branch: string;
}

export async function discoverToolchains(options: {
  source: KlausSourceConfig;
  credentialsProvider: GithubCredentialsProvider;
  logger: LoggerService;
  fetchImpl?: typeof fetch;
}): Promise<DiscoveredToolchain[]> {
  const { source, credentialsProvider, logger, fetchImpl = fetch } = options;
  const { owner, repo } = source;
  const repoUrl = `https://github.com/${owner}/${repo}`;
  const { token } = await credentialsProvider.getCredentials({ url: repoUrl });
  if (!token) {
    throw new Error(`No GitHub credentials for ${repoUrl}`);
  }

  const branch = await resolveDefaultBranch({
    owner,
    repo,
    token,
    fetchImpl,
    logger,
  });

  const candidateDirs = await listToolchainCandidateDirs({
    source,
    token,
    fetchImpl,
    logger,
  });

  const results: DiscoveredToolchain[] = [];
  for (const dirName of candidateDirs) {
    try {
      const hasDockerfile = await dirContainsDockerfile({
        source,
        dirName,
        token,
        fetchImpl,
        logger,
      });
      if (!hasDockerfile) {
        continue;
      }
      results.push({
        name: dirName.slice(KLAUS_DIR_PREFIX.length),
        dirName,
        source,
        branch,
      });
    } catch (error) {
      logger.warn(
        `KlausProvider: failed to inspect ${owner}/${repo} toolchain "${dirName}": ${error}`,
      );
    }
  }

  return results;
}

async function listToolchainCandidateDirs(options: {
  source: KlausSourceConfig;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<string[]> {
  const { source, token, fetchImpl, logger } = options;
  const { owner, repo } = source;
  const response = await githubFetch({
    url: `https://api.github.com/repos/${owner}/${repo}/contents`,
    token,
    fetchImpl,
    logger,
    label: `${owner}/${repo} root contents listing`,
  });
  const entries = (await response.json()) as GithubContentEntry[];
  if (!Array.isArray(entries)) {
    throw new Error(
      `Unexpected response listing root contents for ${owner}/${repo}: not an array`,
    );
  }
  return entries
    .filter(e => e.type === 'dir' && e.name.startsWith(KLAUS_DIR_PREFIX))
    .map(e => e.name);
}

async function dirContainsDockerfile(options: {
  source: KlausSourceConfig;
  dirName: string;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<boolean> {
  const { source, dirName, token, fetchImpl, logger } = options;
  const { owner, repo } = source;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dirName}/Dockerfile`;
  const response = await githubFetch({
    url,
    token,
    fetchImpl,
    logger,
    label: `${owner}/${repo} ${dirName}/Dockerfile probe`,
    allowNotFound: true,
  });
  return response.ok;
}
