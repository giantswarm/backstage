import { createApiRef } from '@backstage/core-plugin-api';

/**
 * API interface for fetching content from GitHub repositories,
 * with authentication support for private repositories.
 */
export interface GitHubApi {
  /**
   * Fetches raw content from a GitHub URL through the backend,
   * which adds authentication for private repositories.
   *
   * @param url - The raw.githubusercontent.com URL to fetch
   * @returns The content as text, or null if the fetch fails
   */
  fetchRawContent(url: string): Promise<string | null>;
}

/**
 * API reference for the GitHub API.
 */
export const gitHubApiRef = createApiRef<GitHubApi>({
  id: 'plugin.gs.github',
});
