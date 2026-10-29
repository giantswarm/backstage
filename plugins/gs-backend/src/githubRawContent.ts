import { GithubCredentialsProvider } from '@backstage/integration';
import fetch, { Response } from 'node-fetch';

const RAW_GITHUB_URL_PATTERN =
  /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/.*/;

/**
 * The owners (GitHub organizations or users) the raw-content proxy attaches
 * the portal's GitHub credentials for when no
 * `gs.githubRawContent.allowedOwners` is configured.
 */
export const DEFAULT_ALLOWED_OWNERS = ['giantswarm'];

/**
 * Fetches content from a URL, adding GitHub authentication when the URL
 * points to raw.githubusercontent.com AND the repository owner is in
 * `allowedOwners`. Any other URL is fetched without credentials, so a
 * caller-supplied URL can never read private content the caller was not
 * meant to see (the portal's GitHub App may have access to far more than
 * the signed-in user does). Falls back to unauthenticated fetch when
 * credentials are unavailable (e.g. public repos without a configured
 * GitHub integration).
 */
export async function fetchGitHubRawContent(
  url: string,
  githubCredentialsProvider: GithubCredentialsProvider,
  allowedOwners: string[] = DEFAULT_ALLOWED_OWNERS,
): Promise<Response> {
  const headers: Record<string, string> = {};
  const match = url.match(RAW_GITHUB_URL_PATTERN);
  if (match && isAllowedOwner(match[1], allowedOwners)) {
    try {
      const repoUrl = `https://github.com/${match[1]}/${match[2]}`;
      const { token } = await githubCredentialsProvider.getCredentials({
        url: repoUrl,
      });
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // Proceed without auth — may still work for public repos
    }
  }

  return fetch(url, { headers });
}

// GitHub owner names are case-insensitive.
function isAllowedOwner(owner: string, allowedOwners: string[]): boolean {
  return allowedOwners.some(
    allowed => allowed.toLowerCase() === owner.toLowerCase(),
  );
}
