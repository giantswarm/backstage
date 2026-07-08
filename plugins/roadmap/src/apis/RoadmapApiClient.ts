import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
  OAuthApi,
} from '@backstage/core-plugin-api';
import {
  ItemFilters,
  RoadmapApi,
  RoadmapItemResponse,
  RoadmapItemsResponse,
  RoadmapSchemaResponse,
  RoadmapSubIssuesResponse,
} from './types';

export const roadmapApiRef = createApiRef<RoadmapApi>({
  id: 'plugin.roadmap.api',
});

/**
 * Scopes requested for board mutations. `project` (classic scope) covers
 * Projects v2 field mutations; `repo` covers the sub-issue REST endpoints.
 * Requested incrementally on the first write, so only roadmap users ever
 * see the extra consent prompt.
 */
const WRITE_SCOPES = ['repo', 'project'];

export class RoadmapApiClient implements RoadmapApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly githubAuthApi: OAuthApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    githubAuthApi: OAuthApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.githubAuthApi = options.githubAuthApi;
  }

  async getSchema(): Promise<RoadmapSchemaResponse> {
    return this.request<RoadmapSchemaResponse>('/schema');
  }

  async listItems(filters: ItemFilters = {}): Promise<RoadmapItemsResponse> {
    return this.request<RoadmapItemsResponse>('/items', { ...filters });
  }

  async getItem(itemId: string): Promise<RoadmapItemResponse> {
    return this.request<RoadmapItemResponse>(
      `/items/${encodeURIComponent(itemId)}`,
    );
  }

  async resolveItem(issue: string): Promise<{ itemId: string }> {
    return this.request<{ itemId: string }>('/resolve-item', { issue });
  }

  async getSubIssues(
    owner: string,
    repo: string,
    number: number,
  ): Promise<RoadmapSubIssuesResponse> {
    return this.request<RoadmapSubIssuesResponse>(
      `/issues/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}/sub-issues`,
    );
  }

  async updateItemField(
    itemId: string,
    name: string,
    value: string,
  ): Promise<void> {
    await this.request(
      `/items/${encodeURIComponent(itemId)}/field`,
      {},
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Token':
            await this.githubAuthApi.getAccessToken(WRITE_SCOPES),
        },
        body: JSON.stringify({ name, value }),
      },
    );
  }

  async addSubIssue(
    owner: string,
    repo: string,
    number: number,
    child: string,
  ): Promise<void> {
    await this.request(
      `/issues/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}/sub-issues`,
      {},
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GitHub-Token':
            await this.githubAuthApi.getAccessToken(WRITE_SCOPES),
        },
        body: JSON.stringify({ child }),
      },
    );
  }

  async removeSubIssue(
    owner: string,
    repo: string,
    number: number,
    subIssueId: number,
  ): Promise<void> {
    await this.request(
      `/issues/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}/sub-issues/${subIssueId}`,
      {},
      {
        method: 'DELETE',
        headers: {
          'X-GitHub-Token':
            await this.githubAuthApi.getAccessToken(WRITE_SCOPES),
        },
      },
    );
  }

  private async request<T>(
    path: string,
    query: Record<string, string | undefined> = {},
    init?: RequestInit,
  ): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('roadmap');
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, value);
      }
    }
    const response = init
      ? await this.fetchApi.fetch(url.toString(), init)
      : await this.fetchApi.fetch(url.toString());
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as { error?: { message?: string } })?.error?.message ??
        `Roadmap request failed with status ${response.status}`;
      const error = new Error(message);
      if (response.status === 401) error.name = 'UnauthorizedError';
      if (response.status === 403) error.name = 'ForbiddenError';
      if (response.status === 404) error.name = 'NotFoundError';
      if (response.status === 503) error.name = 'ServiceUnavailableError';
      throw error;
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }
}
