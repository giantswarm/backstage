import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { RepositoriesAuthApi } from './auth';
import {
  Committed,
  DeclarationEntry,
  DeclarationInput,
  Dispatch,
  InventoryRecord,
  ListFilters,
  ManagerInfo,
  Plan,
  RepositoriesApi,
  RepositoriesConnectionResponse,
  RepositoryListing,
  Validation,
  WriteOptions,
  WriteResult,
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

  validateRepository(input: DeclarationInput): Promise<Validation> {
    return this.request('/repositories/validate', {
      method: 'POST',
      body: input,
    });
  }

  createRepository(
    input: DeclarationInput,
    options: { mode: 'commit' },
  ): Promise<Committed> {
    return this.request('/repositories', {
      method: 'POST',
      body: { ...input, ...options },
    });
  }

  updateRepository<O extends WriteOptions>(
    name: string,
    args: { entry: DeclarationEntry; reason?: string },
    options: O,
  ): Promise<WriteResult<O, Plan, Committed>> {
    return this.write(name, 'update', args, options);
  }

  transferRepository<O extends WriteOptions>(
    name: string,
    args: { toTeam: string; reason?: string },
    options: O,
  ): Promise<WriteResult<O, Plan, Committed>> {
    return this.write(name, 'transfer', args, options);
  }

  setLifecycle<O extends WriteOptions>(
    name: string,
    args: { lifecycle: 'deprecated' | 'archived'; reason?: string },
    options: O,
  ): Promise<WriteResult<O, Plan, Committed>> {
    return this.write(name, 'lifecycle', args, options);
  }

  reconcileRepository(
    name: string,
    args: { team?: string },
    options: WriteOptions,
  ): Promise<Dispatch> {
    return this.write(name, 'reconcile', args, options);
  }

  decideRepository(
    name: string,
    args: { verdict: 'keep'; note?: string },
  ): Promise<InventoryRecord> {
    return this.request(`/repositories/${encodeURIComponent(name)}/decide`, {
      method: 'POST',
      body: args,
    });
  }

  /** One write of a repository: its arguments plus how it lands, as given. */
  private write<T>(
    name: string,
    action: string,
    args: object,
    options: WriteOptions,
  ): Promise<T> {
    return this.request(`/repositories/${encodeURIComponent(name)}/${action}`, {
      method: 'POST',
      body: { ...args, ...options },
    });
  }

  private async request<T>(
    path: string,
    options: {
      method?: 'GET' | 'POST';
      query?: object;
      body?: object;
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
        headers: {
          ...(token && { [MUSTER_AUTH_HEADER]: token }),
          ...(options.body && { 'Content-Type': 'application/json' }),
        },
        ...(options.body && { body: JSON.stringify(options.body) }),
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
