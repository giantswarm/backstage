import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { RoadmapAuthApi } from './auth';
import {
  RoadmapApi,
  RoadmapConnectionResponse,
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
 * Header carrying the caller's muster token to the roadmap backend. Must
 * match MUSTER_AUTH_HEADER in @giantswarm/backstage-plugin-gs-node.
 */
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

/**
 * The caller has no grant for the board's pro server in muster yet. `authUrl`
 * is muster's sign-in URL: one visit connects the person's GitHub account,
 * for this and every later session.
 */
export class MusterServerNotConnectedError extends Error {
  readonly name = 'MusterServerNotConnectedError';
  constructor(
    message: string,
    readonly authUrl?: string,
  ) {
    super(message);
  }
}

export class RoadmapApiClient implements RoadmapApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly authApi: RoadmapAuthApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    authApi: RoadmapAuthApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.authApi = options.authApi;
  }

  async getConnection(): Promise<RoadmapConnectionResponse> {
    return this.request<RoadmapConnectionResponse>('/connection', {});
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

  /** Board mutations, as the caller like every read. */
  private async write(
    path: string,
    options: { method: string; body?: unknown },
  ): Promise<unknown> {
    return this.request(
      path,
      {},
      {
        method: options.method,
        headers: {
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
    // Every request, reads included, runs as the caller: the user's muster
    // token goes along, muster holds the person's GitHub grant.
    const { token } = await this.authApi.getCredentials();
    const headers = {
      ...((init?.headers as Record<string, string> | undefined) ?? {}),
      ...(token && { [MUSTER_AUTH_HEADER]: token }),
    };
    const response = await this.fetchApi.fetch(url.toString(), {
      ...init,
      headers,
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { name?: string; message?: string; authUrl?: string };
      };
      const message =
        errorData?.error?.message ??
        `Roadmap request failed with status ${response.status}`;
      if (errorData?.error?.name === 'MusterServerNotConnectedError') {
        throw new MusterServerNotConnectedError(
          message,
          errorData.error.authUrl,
        );
      }
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
