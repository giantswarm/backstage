import type { LoggerService } from '@backstage/backend-plugin-api';
import type { GithubCredentialsProvider } from '@backstage/integration';

const MAX_RETRIES = 3;
const DEFAULT_BRANCH = 'main';
const KLAUS_DIR_PREFIX = 'klaus-';

export interface KlausToolchainSource {
  owner: string;
  repo: string;
  internal: boolean;
  ociRegistry: string;
}

export interface DiscoveredToolchain {
  name: string;
  dirName: string;
  source: KlausToolchainSource;
  branch: string;
}

interface GithubContentEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  path: string;
}

export async function discoverToolchains(options: {
  source: KlausToolchainSource;
  credentialsProvider: GithubCredentialsProvider;
  logger: LoggerService;
  fetchImpl?: typeof fetch;
}): Promise<DiscoveredToolchain[]> {
  const { source, credentialsProvider, logger, fetchImpl = fetch } = options;
  const repoUrl = `https://github.com/${source.owner}/${source.repo}`;
  const { token } = await credentialsProvider.getCredentials({ url: repoUrl });
  if (!token) {
    throw new Error(`No GitHub credentials for ${repoUrl}`);
  }

  const branch = await resolveDefaultBranch({
    source,
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
        `KlausToolchainsProvider: failed to inspect ${source.owner}/${source.repo} toolchain "${dirName}": ${error}`,
      );
    }
  }

  return results;
}

async function resolveDefaultBranch(options: {
  source: KlausToolchainSource;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<string> {
  const { source, token, fetchImpl, logger } = options;
  try {
    const response = await githubFetch({
      url: `https://api.github.com/repos/${source.owner}/${source.repo}`,
      token,
      fetchImpl,
      logger,
      label: `${source.owner}/${source.repo} repo metadata`,
    });
    const data = (await response.json()) as { default_branch?: string };
    return data.default_branch || DEFAULT_BRANCH;
  } catch (error) {
    logger.warn(
      `KlausToolchainsProvider: failed to resolve default branch for ${source.owner}/${source.repo}, falling back to "${DEFAULT_BRANCH}": ${error}`,
    );
    return DEFAULT_BRANCH;
  }
}

async function listToolchainCandidateDirs(options: {
  source: KlausToolchainSource;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<string[]> {
  const { source, token, fetchImpl, logger } = options;
  const response = await githubFetch({
    url: `https://api.github.com/repos/${source.owner}/${source.repo}/contents`,
    token,
    fetchImpl,
    logger,
    label: `${source.owner}/${source.repo} root contents listing`,
  });
  const entries = (await response.json()) as GithubContentEntry[];
  if (!Array.isArray(entries)) {
    throw new Error(
      `Unexpected response listing root contents for ${source.owner}/${source.repo}: not an array`,
    );
  }
  return entries
    .filter(e => e.type === 'dir' && e.name.startsWith(KLAUS_DIR_PREFIX))
    .map(e => e.name);
}

async function dirContainsDockerfile(options: {
  source: KlausToolchainSource;
  dirName: string;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<boolean> {
  const { source, dirName, token, fetchImpl, logger } = options;
  const url = `https://api.github.com/repos/${source.owner}/${source.repo}/contents/${dirName}/Dockerfile`;
  const response = await githubFetch({
    url,
    token,
    fetchImpl,
    logger,
    label: `${source.owner}/${source.repo} ${dirName}/Dockerfile probe`,
    allowNotFound: true,
  });
  return response.ok;
}

async function githubFetch(options: {
  url: string;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
  label: string;
  accept?: string;
  allowNotFound?: boolean;
}): Promise<Response> {
  const {
    url,
    token,
    fetchImpl,
    logger,
    label,
    accept = 'application/vnd.github+json',
    allowNotFound = false,
  } = options;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (
      response.status === 429 ||
      (response.status >= 500 && response.status < 600)
    ) {
      if (attempt < MAX_RETRIES) {
        const delayMs = getRetryDelayMs(response);
        logger.info(
          `KlausToolchainsProvider: ${label} returned ${response.status}, retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
    }

    if (allowNotFound && response.status === 404) {
      return response;
    }

    if (!response.ok) {
      throw new Error(
        `GitHub API ${url} returned ${response.status}: ${response.statusText}`,
      );
    }

    return response;
  }

  throw new Error(`GitHub API ${url} failed after ${MAX_RETRIES} retries`);
}

function getRetryDelayMs(response: Response): number {
  const rateLimitReset = response.headers.get('x-ratelimit-reset');
  if (rateLimitReset) {
    const resetMs = parseInt(rateLimitReset, 10) * 1000;
    const delayMs = resetMs - Date.now();
    if (delayMs > 0) {
      return delayMs;
    }
  }

  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    return parseInt(retryAfter, 10) * 1000;
  }

  return 60_000;
}
