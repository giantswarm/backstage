const GITHUB_GRAPHQL_URL = 'https://api.github.com/graphql';

/** GraphQL error types that mean a repo cannot be read, not that GitHub failed. */
const UNREADABLE_REPO = new Set(['NOT_FOUND', 'FORBIDDEN']);

export type GraphqlError = {
  message: string;
  type?: string;
  /** The response field the error belongs to, e.g. `['r3']` for an alias. */
  path?: Array<string | number>;
};

export type GraphqlResponse<T> = {
  data?: T;
  errors?: GraphqlError[];
};

/**
 * No GitHub token resolves for a repo's owner. GraphQL has no anonymous mode,
 * so this is a configuration gap rather than a fact about the repo.
 */
export class NoGithubTokenError extends Error {}

/**
 * GitHub's primary or secondary rate limit: clears up on its own, so
 * `isTransientError` recognises it by name.
 */
export class GithubRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GithubRateLimitError';
  }
}

/**
 * A 403 or 429 that GitHub marks as a rate limit: `x-ratelimit-remaining: 0`
 * for the primary limit, `retry-after` or the message for a secondary one.
 */
function isRateLimitResponse(response: Response, text: string): boolean {
  if (response.status !== 403 && response.status !== 429) {
    return false;
  }
  return (
    response.headers.get('x-ratelimit-remaining') === '0' ||
    response.headers.has('retry-after') ||
    /rate limit/i.test(text)
  );
}

/**
 * Posts one query to GitHub's GraphQL API and returns the body as is: partial
 * data and per-field errors are the caller's to interpret. A rate limit, as an
 * HTTP status or as a `RATE_LIMITED` error in a 200 body, throws
 * `GithubRateLimitError`. Any other non-2xx answer throws with the status in
 * the message, so `isTransientError` recognises a 5xx.
 */
export async function githubGraphql<T>(options: {
  query: string;
  variables: Record<string, unknown>;
  token: string;
  fetchImpl: typeof fetch;
}): Promise<GraphqlResponse<T>> {
  const { query, variables, token, fetchImpl } = options;
  const response = await fetchImpl(GITHUB_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const message = `GitHub GraphQL returned ${response.status} ${response.statusText}`;
    if (isRateLimitResponse(response, text)) {
      throw new GithubRateLimitError(message);
    }
    throw new Error(message);
  }
  const body = (await response.json()) as GraphqlResponse<T>;
  const rateLimited = body.errors?.find(e => e.type === 'RATE_LIMITED');
  if (rateLimited) {
    throw new GithubRateLimitError(
      `GitHub GraphQL rate limited: ${rateLimited.message}`,
    );
  }
  return body;
}

/**
 * Renamed, archived away, or outside the GitHub App's installation
 * (`FORBIDDEN`, "Resource not accessible by integration"): a stale slug or a
 * deliberate scope, not a fault.
 */
export function isUnreadableRepoError(error: GraphqlError): boolean {
  return UNREADABLE_REPO.has(error.type ?? '');
}
