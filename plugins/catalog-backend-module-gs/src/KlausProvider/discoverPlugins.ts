import type { LoggerService } from '@backstage/backend-plugin-api';
import type { GithubCredentialsProvider } from '@backstage/integration';
import type { KlausSourceConfig } from './config';
import { githubFetch, resolveDefaultBranch } from './githubFetch';

export interface DiscoveredPlugin {
  name: string;
  source: KlausSourceConfig;
  branch: string;
  description?: string;
  version?: string;
  pluginDir: string;
}

interface MarketplaceJson {
  plugins?: Array<{
    name?: string;
    source?: string;
    description?: string;
    version?: string;
  }>;
}

export async function discoverPlugins(options: {
  source: KlausSourceConfig;
  credentialsProvider: GithubCredentialsProvider;
  logger: LoggerService;
  fetchImpl?: typeof fetch;
}): Promise<DiscoveredPlugin[]> {
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

  const marketplace = await fetchMarketplace({
    source,
    token,
    fetchImpl,
    logger,
  });

  const results: DiscoveredPlugin[] = [];
  for (const entry of marketplace.plugins ?? []) {
    if (!entry?.name || !entry?.source) {
      logger.warn(
        `KlausProvider: skipping malformed marketplace entry in ${owner}/${repo}: ${JSON.stringify(entry)}`,
      );
      continue;
    }
    results.push({
      name: entry.name,
      source,
      branch,
      description: entry.description,
      version: entry.version,
      pluginDir: entry.source.replace(/^\.\//, ''),
    });
  }

  return results;
}

async function fetchMarketplace(options: {
  source: KlausSourceConfig;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
}): Promise<MarketplaceJson> {
  const { source, token, fetchImpl, logger } = options;
  const { owner, repo } = source;
  const response = await githubFetch({
    url: `https://api.github.com/repos/${owner}/${repo}/contents/.claude-plugin/marketplace.json`,
    token,
    fetchImpl,
    logger,
    label: `${owner}/${repo} .claude-plugin/marketplace.json`,
    accept: 'application/vnd.github.raw+json',
  });
  const text = await response.text();
  try {
    return JSON.parse(text) as MarketplaceJson;
  } catch (error) {
    throw new Error(
      `Failed to parse marketplace.json from ${owner}/${repo}: ${error}`,
    );
  }
}
