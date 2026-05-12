import type { LoggerService } from '@backstage/backend-plugin-api';

const MAX_RETRIES = 3;
const DEFAULT_MAX_PAGES = 5;
const PER_PAGE = 100;

export interface LatestRelease {
  tag: string;
  publishedAt: string;
}

interface GithubRelease {
  tag_name: string;
  published_at: string | null;
  created_at: string | null;
  draft: boolean;
  prerelease: boolean;
}

/**
 * For each prefix (e.g. `sre/`), finds the latest non-draft release in the
 * given monorepo whose `tag_name` starts with that prefix. Prereleases are
 * included. Paginates until every prefix is matched, pages are exhausted, or
 * the page cap is hit. Returns a map keyed by prefix.
 */
export async function listLatestReleasesByPrefix(options: {
  owner: string;
  repo: string;
  prefixes: string[];
  token: string;
  fetchImpl?: typeof fetch;
  logger: LoggerService;
  label: string;
  maxPages?: number;
}): Promise<Map<string, LatestRelease>> {
  const {
    owner,
    repo,
    prefixes,
    token,
    fetchImpl = fetch,
    logger,
    label,
    maxPages = DEFAULT_MAX_PAGES,
  } = options;

  const result = new Map<string, LatestRelease>();
  if (prefixes.length === 0) {
    return result;
  }

  const pending = new Set(prefixes);

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=${PER_PAGE}&page=${page}`;
    const response = await githubFetch({
      url,
      token,
      fetchImpl,
      logger,
      label: `${label} releases page ${page}`,
    });
    const releases = (await response.json()) as GithubRelease[];
    if (!Array.isArray(releases) || releases.length === 0) {
      break;
    }

    for (const release of releases) {
      if (release.draft) {
        continue;
      }
      const tag = release.tag_name;
      if (!tag) {
        continue;
      }
      const matchedPrefix = findMatchingPrefix(tag, pending);
      if (!matchedPrefix) {
        continue;
      }
      const publishedAt = release.published_at ?? release.created_at;
      if (!publishedAt) {
        continue;
      }
      result.set(matchedPrefix, { tag, publishedAt });
      pending.delete(matchedPrefix);
    }

    if (pending.size === 0) {
      break;
    }
    if (releases.length < PER_PAGE) {
      break;
    }
  }

  return result;
}

/**
 * Fetches the GitHub-canonical latest release (most recent non-draft,
 * non-prerelease) for a repo via `/repos/{owner}/{repo}/releases/latest`.
 * Returns undefined when the repo has no published stable releases.
 */
export async function getLatestStableRelease(options: {
  owner: string;
  repo: string;
  token: string;
  fetchImpl?: typeof fetch;
  logger: LoggerService;
  label: string;
}): Promise<LatestRelease | undefined> {
  const { owner, repo, token, fetchImpl = fetch, logger, label } = options;

  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const response = await githubFetch({
    url,
    token,
    fetchImpl,
    logger,
    label,
    allowNotFound: true,
  });
  if (response.status === 404) {
    return undefined;
  }
  const release = (await response.json()) as GithubRelease;
  if (!release?.tag_name) {
    return undefined;
  }
  const publishedAt = release.published_at ?? release.created_at;
  if (!publishedAt) {
    return undefined;
  }
  return { tag: release.tag_name, publishedAt };
}

function findMatchingPrefix(
  tag: string,
  prefixes: Set<string>,
): string | undefined {
  for (const prefix of prefixes) {
    if (tag.startsWith(prefix)) {
      return prefix;
    }
  }
  return undefined;
}

async function githubFetch(options: {
  url: string;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
  label: string;
  allowNotFound?: boolean;
}): Promise<Response> {
  const {
    url,
    token,
    fetchImpl,
    logger,
    label,
    allowNotFound = false,
  } = options;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
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
          `${label} returned ${response.status}, retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
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
