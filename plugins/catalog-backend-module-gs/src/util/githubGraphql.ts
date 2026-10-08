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
 * Posts one query to GitHub's GraphQL API and returns the body as is: partial
 * data and per-field errors are the caller's to interpret. A non-2xx answer
 * throws with the status in the message, so `isTransientError` recognises a
 * rate limit or a 5xx.
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
    throw new Error(
      `GitHub GraphQL returned ${response.status} ${response.statusText}`,
    );
  }
  return (await response.json()) as GraphqlResponse<T>;
}

/**
 * Renamed, archived away, or outside the GitHub App's installation
 * (`FORBIDDEN`, "Resource not accessible by integration"): a stale slug or a
 * deliberate scope, not a fault.
 */
export function isUnreadableRepoError(error: GraphqlError): boolean {
  return UNREADABLE_REPO.has(error.type ?? '');
}
