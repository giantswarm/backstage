import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  NewReviewComment,
  PlanComment,
  PlanReviewComment,
  PlansApi,
  PlansCommentsResponse,
  PlansContentResponse,
  PlansPullFilesResponse,
  PlansPullsResponse,
  PlansReposResponse,
  PlansReviewCommentsResponse,
  PlansTreeResponse,
} from './types';

export const plansApiRef = createApiRef<PlansApi>({
  id: 'plugin.plans.api',
});

export class PlansApiClient implements PlansApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;

  constructor(options: { discoveryApi: DiscoveryApi; fetchApi: FetchApi }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
  }

  async listRepos(): Promise<PlansReposResponse> {
    return this.get<PlansReposResponse>('/repos');
  }

  async listPulls(repo?: string): Promise<PlansPullsResponse> {
    return this.get<PlansPullsResponse>('/pulls', { repo });
  }

  async listPullFiles(
    pullNumber: number,
    repo?: string,
  ): Promise<PlansPullFilesResponse> {
    return this.get<PlansPullFilesResponse>(`/pulls/${pullNumber}/files`, {
      repo,
    });
  }

  async getTree(ref?: string, repo?: string): Promise<PlansTreeResponse> {
    return this.get<PlansTreeResponse>('/tree', { ref, repo });
  }

  async getContent(
    path: string,
    ref?: string,
    repo?: string,
  ): Promise<PlansContentResponse> {
    return this.get<PlansContentResponse>('/content', { path, ref, repo });
  }

  async listPullComments(
    pullNumber: number,
    repo?: string,
  ): Promise<PlansCommentsResponse> {
    return this.get<PlansCommentsResponse>(`/pulls/${pullNumber}/comments`, {
      repo,
    });
  }

  async createPullComment(
    pullNumber: number,
    body: string,
    repo?: string,
  ): Promise<PlanComment> {
    const result = await this.post<{ comment: PlanComment }>(
      `/pulls/${pullNumber}/comments`,
      { body },
      { repo },
    );
    return result.comment;
  }

  async listReviewComments(
    pullNumber: number,
    repo?: string,
  ): Promise<PlansReviewCommentsResponse> {
    return this.get<PlansReviewCommentsResponse>(
      `/pulls/${pullNumber}/review-comments`,
      { repo },
    );
  }

  async createReviewComment(
    pullNumber: number,
    comment: NewReviewComment,
    repo?: string,
  ): Promise<PlanReviewComment> {
    const result = await this.post<{ comment: PlanReviewComment }>(
      `/pulls/${pullNumber}/review-comments`,
      comment,
      { repo },
    );
    return result.comment;
  }

  private async get<T>(
    path: string,
    query: Record<string, string | undefined> = {},
  ): Promise<T> {
    return this.request<T>(path, query);
  }

  private async post<T>(
    path: string,
    body: unknown,
    query: Record<string, string | undefined> = {},
  ): Promise<T> {
    return this.request<T>(path, query, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(
    path: string,
    query: Record<string, string | undefined>,
    init?: RequestInit,
  ): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('plans');
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
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
        `Plans request failed with status ${response.status}`;
      const error = new Error(message);
      if (response.status === 401) error.name = 'UnauthorizedError';
      if (response.status === 403) error.name = 'ForbiddenError';
      if (response.status === 404) error.name = 'NotFoundError';
      if (response.status === 503) error.name = 'ServiceUnavailableError';
      throw error;
    }
    return response.json() as Promise<T>;
  }
}
