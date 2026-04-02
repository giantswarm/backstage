import { GitHubApi } from '../../../apis/github/types';

/**
 * Fetches text content from a URL. Uses the GitHub backend proxy for
 * raw.githubusercontent.com URLs (to add authentication for private repos),
 * and falls back to a direct fetch for all other URLs.
 */
export async function fetchContent(
  url: string,
  gitHubApi: GitHubApi,
): Promise<string | null> {
  if (url.startsWith('https://raw.githubusercontent.com/')) {
    return gitHubApi.fetchRawContent(url);
  }

  const response = await fetch(url);
  if (!response.ok) {
    return null;
  }

  return response.text();
}
