import { GithubCredentialsProvider } from '@backstage/integration';
import fetch, { Response } from 'node-fetch';

/**
 * Fetches content from a URL, adding GitHub authentication when the URL
 * points to raw.githubusercontent.com and the credentials provider grants
 * it. The provider is expected to be wrapped in
 * `AllowedOwnersGithubCredentialsProvider`, which refuses owners outside
 * `gs.github.allowedOwners`; a refusal (like any credentials failure) falls
 * back to an unauthenticated fetch, so public content stays reachable.
 *
 * The URL is parsed up front and both the owner check and the fetch use the
 * WHATWG-normalized form: `node-fetch` requests the normalized URL, so
 * deriving the owner from the raw string would let dot segments (`..`,
 * `%2e%2e`) or backslashes smuggle a different owner past the credentials
 * check.
 */
export async function fetchGitHubRawContent(
  url: string,
  githubCredentialsProvider: GithubCredentialsProvider,
): Promise<Response> {
  const parsed = new URL(url);
  const headers: Record<string, string> = {};

  if (
    parsed.protocol === 'https:' &&
    parsed.hostname === 'raw.githubusercontent.com'
  ) {
    const [owner, repo] = parsed.pathname.split('/').filter(Boolean);
    if (owner && repo) {
      try {
        const { token } = await githubCredentialsProvider.getCredentials({
          url: `https://github.com/${owner}/${repo}`,
        });
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // Owner not allowed, or no integration/credentials — proceed without
        // auth; may still work for public repos.
      }
    }
  }

  return fetch(parsed.href, { headers });
}
