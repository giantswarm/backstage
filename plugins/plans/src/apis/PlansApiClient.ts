import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { PlansAuthApi } from './auth';
import {
  NewReviewComment,
  PlanComment,
  PlanReviewComment,
  PlansApi,
  PlansCommentsResponse,
  PlansConnectionResponse,
  PlansContentResponse,
  PlansEpicsResponse,
  PlansPullFilesResponse,
  PlansPullsResponse,
  PlansReposResponse,
  PlansReviewCommentsResponse,
  PlansTreeResponse,
} from './types';

export const plansApiRef = createApiRef<PlansApi>({
  id: 'plugin.plans.api',
});

/**
 * Header carrying the caller's muster token to the plans backend. Must match
 * MUSTER_AUTH_HEADER in @giantswarm/backstage-plugin-gs-node.
 */
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

/**
 * The caller has no GitHub grant in muster yet. `authUrl` is muster's
 * sign-in URL: one visit connects the person's GitHub account, for this and
 * every later session.
 */
export class GithubNotConnectedError extends Error {
  readonly name = 'GithubNotConnectedError';
  constructor(
    message: string,
    readonly authUrl?: string,
  ) {
    super(message);
  }
}

/**
 * Client for the plans backend. Every request carries the signed-in user's
 * muster token; the backend calls GitHub through muster as that person, so
 * plan repositories are read as them and comments are authored by them on
 * GitHub -- there is no GitHub credential anywhere in the portal.
 */
export class PlansApiClient implements PlansApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly authApi: PlansAuthApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    authApi: PlansAuthApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.authApi = options.authApi;
  }

  async listRepos(): Promise<PlansReposResponse> {
    return this.get<PlansReposResponse>('/repos');
  }

  async getConnection(): Promise<PlansConnectionResponse> {
    return this.get<PlansConnectionResponse>('/connection');
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

  async listEpics(repo?: string): Promise<PlansEpicsResponse> {
    return this.get<PlansEpicsResponse>('/epics', { repo });
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
    return this.request<T>(path, query, {});
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
    init: RequestInit & { headers?: Record<string, string> },
  ): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('plans');
    const url = new URL(`${baseUrl}${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
    const { token } = await this.authApi.getCredentials();
    const response = await this.fetchApi.fetch(url.toString(), {
      ...init,
      headers: {
        ...init.headers,
        ...(token && { [MUSTER_AUTH_HEADER]: token }),
      },
    });
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { name?: string; message?: string; authUrl?: string };
      };
      const message =
        errorData?.error?.message ??
        `Plans request failed with status ${response.status}`;
      if (errorData?.error?.name === 'GithubNotConnectedError') {
        throw new GithubNotConnectedError(message, errorData.error.authUrl);
      }
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
