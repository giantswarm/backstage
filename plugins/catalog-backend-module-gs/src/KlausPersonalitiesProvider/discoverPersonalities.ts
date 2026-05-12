import type { LoggerService } from '@backstage/backend-plugin-api';
import type { GithubCredentialsProvider } from '@backstage/integration';
import yaml from 'js-yaml';

const MAX_RETRIES = 3;
const DEFAULT_BRANCH = 'main';

export interface KlausPersonalitySource {
  owner: string;
  repo: string;
  internal: boolean;
}

export interface DiscoveredPersonality {
  name: string;
  source: KlausPersonalitySource;
  branch: string;
  toolchain?: { repository: string; tag: string };
  plugins: Array<{ repository: string; tag: string }>;
}

interface GithubContentEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  path: string;
}

interface PersonalityYaml {
  name?: string;
  toolchain?: { repository?: string; tag?: string };
  plugins?: Array<{ repository?: string; tag?: string }>;
}

export async function discoverPersonalities(options: {
  source: KlausPersonalitySource;
  credentialsProvider: GithubCredentialsProvider;
  logger: LoggerService;
  fetchImpl?: typeof fetch;
}): Promise<DiscoveredPersonality[]> {
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
      const parsed = (yaml.load(yamlText) ?? {}) as PersonalityYaml;
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
        `KlausPersonalitiesProvider: failed to read ${source.owner}/${source.repo} personality "${dir}": ${error}`,
      );
    }
  }

  return results;
}

async function resolveDefaultBranch(options: {
  source: KlausPersonalitySource;
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
      `KlausPersonalitiesProvider: failed to resolve default branch for ${source.owner}/${source.repo}, falling back to "${DEFAULT_BRANCH}": ${error}`,
    );
    return DEFAULT_BRANCH;
  }
}

async function listPersonalityDirs(options: {
  source: KlausPersonalitySource;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<string[]> {
  const { source, token, fetchImpl, logger } = options;
  const response = await githubFetch({
    url: `https://api.github.com/repos/${source.owner}/${source.repo}/contents/personalities`,
    token,
    fetchImpl,
    logger,
    label: `${source.owner}/${source.repo} personalities listing`,
  });
  const entries = (await response.json()) as GithubContentEntry[];
  if (!Array.isArray(entries)) {
    throw new Error(
      `Unexpected response listing personalities for ${source.owner}/${source.repo}: not an array`,
    );
  }
  return entries.filter(e => e.type === 'dir').map(e => e.name);
}

async function fetchPersonalityYaml(options: {
  source: KlausPersonalitySource;
  name: string;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<string> {
  const { source, name, token, fetchImpl, logger } = options;
  const response = await githubFetch({
    url: `https://api.github.com/repos/${source.owner}/${source.repo}/contents/personalities/${name}/personality.yaml`,
    token,
    fetchImpl,
    logger,
    label: `${source.owner}/${source.repo} personalities/${name}/personality.yaml`,
    accept: 'application/vnd.github.raw+json',
  });
  return response.text();
}

async function githubFetch(options: {
  url: string;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
  label: string;
  accept?: string;
}): Promise<Response> {
  const {
    url,
    token,
    fetchImpl,
    logger,
    label,
    accept = 'application/vnd.github+json',
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
          `KlausPersonalitiesProvider: ${label} returned ${response.status}, retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
        continue;
      }
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
