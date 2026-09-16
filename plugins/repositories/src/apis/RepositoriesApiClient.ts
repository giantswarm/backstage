import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { RepositoriesAuthApi } from './auth';
import {
  InventoryRecord,
  ListFilters,
  ManagerInfo,
  RepositoriesApi,
  RepositoriesConnectionResponse,
  RepositoryListing,
} from './types';

export const repositoriesApiRef = createApiRef<RepositoriesApi>({
  id: 'plugin.repositories.api',
});

/**
 * Header carrying the caller's muster token to the backend. Must match
 * MUSTER_AUTH_HEADER in @giantswarm/backstage-plugin-gs-node.
 */
const MUSTER_AUTH_HEADER = 'backstage-muster-authorization';

/**
 * The caller has no grant for the manager in muster yet. `authUrl` is
 * muster's sign-in URL: one visit connects the person, for this and every
 * later session.
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

/**
 * Client for the repositories backend. Every request carries the signed-in
 * user's muster token; the backend calls giantswarm-repo-manager through
 * muster as that person.
 */
export class RepositoriesApiClient implements RepositoriesApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly authApi: RepositoriesAuthApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    authApi: RepositoriesAuthApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.authApi = options.authApi;
  }

  getConnection(): Promise<RepositoriesConnectionResponse> {
    return this.request('/connection');
  }

  getInfo(): Promise<ManagerInfo> {
    return this.request('/info');
  }

  listRepositories(filters: ListFilters): Promise<RepositoryListing> {
    return this.request('/repositories', { query: filters });
  }

  getRepository(
    name: string,
    stalePeriodDays?: number,
  ): Promise<InventoryRecord> {
    return this.request(`/repositories/${encodeURIComponent(name)}`, {
      query: { stalePeriodDays },
    });
  }

  refreshRepository(name: string): Promise<InventoryRecord> {
    return this.request(`/repositories/${encodeURIComponent(name)}/refresh`, {
      method: 'POST',
    });
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      query?: object;
    } = {},
  ): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('repositories');
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {}) as [
      string,
      string | number | boolean | undefined,
    ][]) {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    }
    const search = params.toString();
    const { token } = await this.authApi.getCredentials();
    const response = await this.fetchApi.fetch(
      `${baseUrl}${path}${search ? `?${search}` : ''}`,
      {
        method: options.method ?? 'GET',
        headers: token ? { [MUSTER_AUTH_HEADER]: token } : {},
      },
    );
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const error = body?.error ?? {};
      if (error.name === 'MusterServerNotConnectedError') {
        throw new MusterServerNotConnectedError(error.message, error.authUrl);
      }
      const failure = new Error(
        error.message ?? `${response.status} ${response.statusText}`,
      );
      failure.name = error.name ?? 'Error';
      throw failure;
    }
    return (await response.json()) as T;
  }
}
