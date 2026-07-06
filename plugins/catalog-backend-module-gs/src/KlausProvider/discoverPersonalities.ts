import type { LoggerService } from '@backstage/backend-plugin-api';
import type { GithubCredentialsProvider } from '@backstage/integration';
import { loadAll } from 'js-yaml';
import type { KlausSourceConfig } from './config';
import {
  type GithubContentEntry,
  githubFetch,
  resolveDefaultBranch,
} from './githubFetch';

export interface DiscoveredPersonality {
  name: string;
  source: KlausSourceConfig;
  branch: string;
  toolchain?: { repository: string; tag: string };
  plugins: Array<{ repository: string; tag: string }>;
}

interface PersonalityYaml {
  name?: string;
  toolchain?: { repository?: string; tag?: string };
  plugins?: Array<{ repository?: string; tag?: string }>;
}

export async function discoverPersonalities(options: {
  source: KlausSourceConfig;
  credentialsProvider: GithubCredentialsProvider;
  logger: LoggerService;
  fetchImpl?: typeof fetch;
}): Promise<DiscoveredPersonality[]> {
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

  const dirs = await listPersonalityDirs({ source, token, fetchImpl, logger });

  const results: DiscoveredPersonality[] = [];
  for (const dir of dirs) {
    try {
      const yamlText = await fetchPersonalityYaml({
        source,
        name: dir,
        token,
        fetchImpl,
        logger,
      });
      // loadAll tolerates empty/comment-only files (js-yaml v5's load() throws
      // on those); take the first document, defaulting to an empty personality.
      const parsed = (loadAll(yamlText)[0] ?? {}) as PersonalityYaml;
      results.push({
        name: dir,
        source,
        branch,
        toolchain:
          parsed.toolchain?.repository && parsed.toolchain?.tag
            ? {
                repository: parsed.toolchain.repository,
                tag: parsed.toolchain.tag,
              }
            : undefined,
        plugins:
          parsed.plugins
            ?.filter(p => p?.repository && p?.tag)
            .map(p => ({ repository: p.repository!, tag: p.tag! })) ?? [],
      });
    } catch (error) {
      logger.warn(
        `KlausProvider: failed to read ${owner}/${repo} personality "${dir}": ${error}`,
      );
    }
  }

  return results;
}

async function listPersonalityDirs(options: {
  source: KlausSourceConfig;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<string[]> {
  const { source, token, fetchImpl, logger } = options;
  const { owner, repo } = source;
  const response = await githubFetch({
    url: `https://api.github.com/repos/${owner}/${repo}/contents/personalities`,
    token,
    fetchImpl,
    logger,
    label: `${owner}/${repo} personalities listing`,
  });
  const entries = (await response.json()) as GithubContentEntry[];
  if (!Array.isArray(entries)) {
    throw new Error(
      `Unexpected response listing personalities for ${owner}/${repo}: not an array`,
    );
  }
  return entries.filter(e => e.type === 'dir').map(e => e.name);
}

async function fetchPersonalityYaml(options: {
  source: KlausSourceConfig;
  name: string;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<string> {
  const { source, name, token, fetchImpl, logger } = options;
  const { owner, repo } = source;
  const response = await githubFetch({
    url: `https://api.github.com/repos/${owner}/${repo}/contents/personalities/${name}/personality.yaml`,
    token,
    fetchImpl,
    logger,
    label: `${owner}/${repo} personalities/${name}/personality.yaml`,
    accept: 'application/vnd.github.raw+json',
  });
  return response.text();
}
