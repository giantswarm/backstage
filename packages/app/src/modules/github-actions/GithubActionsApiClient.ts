import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import type { GithubActionsApi } from '@backstage-community/plugin-github-actions';

/**
 * Header the Giant Swarm frontends use to forward the user's own token for a
 * muster installation's `authProvider` to the backend plugins that call
 * muster on the user's behalf. Must match MUSTER_AUTH_HEADER in
 * @giantswarm/backstage-plugin-gs-node.
 */
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

/** Whether the caller's muster session reaches GitHub, or the sign-in URL. */
export interface GithubActionsConnection {
  connected: boolean;
  server?: string;
  authUrl?: string;
  message?: string;
}

/**
 * GitHub is not connected for this person in muster yet: the backend answered
 * 401 with the URL where they connect it (once, for all their sessions).
 */
export class MusterServerNotConnectedError extends Error {
  readonly name = 'MusterServerNotConnectedError';
  constructor(
    message: string,
    readonly server?: string,
    readonly authUrl?: string,
  ) {
    super(message);
  }
}

/** Where the client gets the caller's muster token (the Dex ID token). */
export interface MusterTokenSource {
  getToken(): Promise<string | undefined>;
}

/**
 * The community GitHub Actions plugin's API, served by the github-actions
 * backend through muster as the signed-in person: no GitHub token reaches the
 * browser, every read and re-run is attributed to the person. Only github.com
 * repositories: the muster server is the remote GitHub MCP server.
 */
export class MusterGithubActionsClient implements GithubActionsApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly tokenSource: MusterTokenSource;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    tokenSource: MusterTokenSource;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.tokenSource = options.tokenSource;
  }

  async getConnection(): Promise<GithubActionsConnection> {
    return this.request<GithubActionsConnection>('/connection');
  }

  async reRunWorkflow(options: {
    hostname?: string;
    owner: string;
    repo: string;
    runId: number;
  }): Promise<any> {
    const { owner, repo, runId } = this.repoOf(options);
    return this.request(
      `/repos/${owner}/${repo}/runs/${encodeURIComponent(String(runId))}/rerun`,
      { method: 'POST' },
    );
  }

  async listWorkflowRuns(options: {
    hostname?: string;
    owner: string;
    repo: string;
    pageSize?: number;
    page?: number;
    branch?: string;
  }): Promise<any> {
    const { owner, repo } = this.repoOf(options);
    const params = new URLSearchParams();
    if (options.pageSize !== undefined) {
      params.set('pageSize', String(options.pageSize));
    }
    if (options.page !== undefined) {
      params.set('page', String(options.page));
    }
    if (options.branch) {
      params.set('branch', options.branch);
    }
    const query = params.toString();
    return this.request(
      `/repos/${owner}/${repo}/runs${query ? `?${query}` : ''}`,
    );
  }

  async getWorkflow(options: {
    hostname?: string;
    owner: string;
    repo: string;
    id: number;
  }): Promise<any> {
    const { owner, repo } = this.repoOf(options);
    return this.request(
      `/repos/${owner}/${repo}/workflows/${encodeURIComponent(String(options.id))}`,
    );
  }

  async getWorkflowRun(options: {
    hostname?: string;
    owner: string;
    repo: string;
    id: number;
  }): Promise<any> {
    const { owner, repo } = this.repoOf(options);
    return this.request(
      `/repos/${owner}/${repo}/runs/${encodeURIComponent(String(options.id))}`,
    );
  }

  async listJobsForWorkflowRun(options: {
    hostname?: string;
    owner: string;
    repo: string;
    id: number;
    pageSize?: number;
    page?: number;
  }): Promise<any> {
    const { owner, repo } = this.repoOf(options);
    const params = new URLSearchParams();
    if (options.pageSize !== undefined) {
      params.set('pageSize', String(options.pageSize));
    }
    if (options.page !== undefined) {
      params.set('page', String(options.page));
    }
    const query = params.toString();
    return this.request(
      `/repos/${owner}/${repo}/runs/${encodeURIComponent(String(options.id))}/jobs${
        query ? `?${query}` : ''
      }`,
    );
  }

  /** The community plugin passes the job id as `runId` here. */
  async downloadJobLogsForWorkflowRun(options: {
    hostname?: string;
    owner: string;
    repo: string;
    runId: number;
  }): Promise<any> {
    const { owner, repo, runId } = this.repoOf(options);
    return this.request<string>(
      `/repos/${owner}/${repo}/jobs/${encodeURIComponent(String(runId))}/logs`,
      undefined,
      'text',
    );
  }

  async listBranches(options: {
    hostname?: string;
    owner: string;
    repo: string;
    page?: number;
  }): Promise<any> {
    const { owner, repo } = this.repoOf(options);
    const query =
      options.page !== undefined
        ? `?page=${encodeURIComponent(options.page)}`
        : '';
    return this.request(`/repos/${owner}/${repo}/branches${query}`);
  }

  async getDefaultBranch(options: {
    hostname?: string;
    owner: string;
    repo: string;
  }): Promise<any> {
    const { owner, repo } = this.repoOf(options);
    const data = await this.request<{ default_branch: string }>(
      `/repos/${owner}/${repo}`,
    );
    return data.default_branch;
  }

  private repoOf<T extends { hostname?: string; owner: string; repo: string }>(
    options: T,
  ): T & { owner: string; repo: string } {
    if (options.hostname && options.hostname !== 'github.com') {
      throw new Error(
        `GitHub Actions through muster serve github.com only, not ${options.hostname}.`,
      );
    }
    return {
      ...options,
      owner: encodeURIComponent(options.owner),
      repo: encodeURIComponent(options.repo),
    };
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    as: 'json' | 'text' = 'json',
  ): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('github-actions');
    const token = await this.tokenSource.getToken();
    const response = await this.fetchApi.fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        ...(token ? { [MUSTER_AUTH_HEADER]: token } : {}),
      },
    });
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      let errorData:
        | {
            error?: {
              name?: string;
              message?: string;
              server?: string;
              authUrl?: string;
            };
          }
        | undefined;
      try {
        errorData = await response.json();
        message = errorData?.error?.message ?? message;
      } catch {
        // not JSON
      }
      if (errorData?.error?.name === 'MusterServerNotConnectedError') {
        throw new MusterServerNotConnectedError(
          message,
          errorData.error.server,
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
    if (as === 'text') {
      return (await response.text()) as unknown as T;
    }
    return (await response.json()) as T;
  }
}
