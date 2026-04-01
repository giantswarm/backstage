import { GithubCredentialsProvider } from '@backstage/integration';
import fetch, { Response } from 'node-fetch';

const RAW_GITHUB_URL_PATTERN =
  /^https:\/\/raw\.githubusercontent\.com\/([^/]+\/[^/]+)\/.*/;

/**
 * Fetches content from a URL, adding GitHub authentication when the URL
 * points to raw.githubusercontent.com. Falls back to unauthenticated
 * fetch when credentials are unavailable (e.g. public repos without
 * a configured GitHub integration).
 */
export async function fetchGitHubRawContent(
  url: string,
  githubCredentialsProvider: GithubCredentialsProvider,
): Promise<Response> {
  const headers: Record<string, string> = {};
  const match = url.match(RAW_GITHUB_URL_PATTERN);
  if (match) {
    try {
      const repoUrl = `https://github.com/${match[1]}`;
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
