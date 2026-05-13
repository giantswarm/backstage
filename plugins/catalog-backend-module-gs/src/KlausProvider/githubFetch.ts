import type { LoggerService } from '@backstage/backend-plugin-api';

const MAX_RETRIES = 3;

export interface GithubContentEntry {
  name: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  path: string;
}

export async function githubFetch(options: {
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
          `KlausProvider: ${label} returned ${response.status}, retrying in ${Math.ceil(delayMs / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`,
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

export async function resolveDefaultBranch(options: {
  owner: string;
  repo: string;
  token: string;
  fetchImpl: typeof fetch;
  logger: LoggerService;
  fallbackBranch?: string;
}): Promise<string> {
  const {
    owner,
    repo,
    token,
    fetchImpl,
    logger,
    fallbackBranch = 'main',
  } = options;
  try {
    const response = await githubFetch({
      url: `https://api.github.com/repos/${owner}/${repo}`,
      token,
      fetchImpl,
      logger,
      label: `${owner}/${repo} repo metadata`,
    });
    const data = (await response.json()) as { default_branch?: string };
    return data.default_branch || fallbackBranch;
  } catch (error) {
    logger.warn(
      `KlausProvider: failed to resolve default branch for ${owner}/${repo}, falling back to "${fallbackBranch}": ${error}`,
    );
    return fallbackBranch;
  }
}
