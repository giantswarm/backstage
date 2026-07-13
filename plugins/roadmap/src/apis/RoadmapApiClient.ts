import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
  OAuthApi,
} from '@backstage/core-plugin-api';
import {
  RoadmapApi,
  RoadmapItemDetailResponse,
  RoadmapItemFilters,
  RoadmapItemsResponse,
  RoadmapOverviewResponse,
  RoadmapSchemaResponse,
  RoadmapSubIssuesResponse,
} from './types';

export const roadmapApiRef = createApiRef<RoadmapApi>({
  id: 'plugin.roadmap.api',
});

/**
 * GitHub OAuth scopes required for board mutations. Projects v2 field
 * updates need the classic `project` scope, which is not in the portal's
 * default scope set -- it is requested incrementally on the first write so
 * only roadmap users ever see the extra consent prompt.
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
    return this.request<RoadmapSchemaResponse>('/schema', {});
  }

  async listItems(
    filters: RoadmapItemFilters = {},
  ): Promise<RoadmapItemsResponse> {
    return this.request<RoadmapItemsResponse>('/items', { ...filters });
  }

  async getItem(id: string): Promise<RoadmapItemDetailResponse> {
    return this.request<RoadmapItemDetailResponse>(
      `/items/${encodeURIComponent(id)}`,
      {},
    );
  }

  async getOverview(team?: string): Promise<RoadmapOverviewResponse> {
    return this.request<RoadmapOverviewResponse>('/overview', { team });
  }

  async listSubIssues(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<RoadmapSubIssuesResponse> {
    return this.request<RoadmapSubIssuesResponse>(
      `/issues/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${issueNumber}/sub-issues`,
      {},
    );
  }

  async updateItemField(
    id: string,
    name: string,
    value: string,
  ): Promise<void> {
    await this.write(`/items/${encodeURIComponent(id)}/field`, {
      method: 'PATCH',
      body: { name, value },
    });
  }

  async addSubIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    child: string,
  ): Promise<void> {
    await this.write(
      `/issues/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${issueNumber}/sub-issues`,
      { method: 'POST', body: { child } },
    );
  }

  async removeSubIssue(
    owner: string,
    repo: string,
    issueNumber: number,
    subIssueId: number,
  ): Promise<void> {
    await this.write(
      `/issues/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${issueNumber}/sub-issues/${subIssueId}`,
      { method: 'DELETE' },
    );
  }

  /**
   * Board mutations run with the caller's GitHub OAuth token (X-GitHub-Token)
   * so they are attributed to the person, never to the shared App identity.
   */
  private async write(
    path: string,
    options: { method: string; body?: unknown },
  ): Promise<unknown> {
    const token = await this.githubAuthApi.getAccessToken(WRITE_SCOPES);
    return this.request(
      path,
      {},
      {
        method: options.method,
        headers: {
          'X-GitHub-Token': token,
          ...(options.body !== undefined && {
            'Content-Type': 'application/json',
          }),
        },
        ...(options.body !== undefined && {
          body: JSON.stringify(options.body),
        }),
      },
    );
  }

  private async request<T>(
    path: string,
    query: Record<string, string | undefined>,
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
