import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import { PlatformCapabilitiesAuthApi } from './auth';
import {
  Action,
  ActionListing,
  CapabilityArgs,
  ConnectionResponse,
  InstallationListing,
  ListInstallationsFilters,
  ManagerInfo,
  PlatformCapabilitiesApi,
  VerifyResult,
  WriteOptions,
  WriteResult,
} from './types';

export const platformCapabilitiesApiRef = createApiRef<PlatformCapabilitiesApi>(
  { id: 'plugin.platform-capabilities.api' },
);

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
 * Client for the platform-capabilities backend. Every request carries the
 * signed-in user's muster token; the backend calls
 * giantswarm-platform-manager through muster as that person.
 */
export class PlatformCapabilitiesApiClient implements PlatformCapabilitiesApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly authApi: PlatformCapabilitiesAuthApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    authApi: PlatformCapabilitiesAuthApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.authApi = options.authApi;
  }

  getConnection(): Promise<ConnectionResponse> {
    return this.request('/connection');
  }

  getInfo(): Promise<ManagerInfo> {
    return this.request('/info');
  }

  listInstallations(
    filters: ListInstallationsFilters = {},
  ): Promise<InstallationListing> {
    return this.request('/installations', {
      query: {
        installations: filters.installations?.join(','),
        customer: filters.customer,
        summary: filters.summary,
      },
    });
  }

  enableCapability<O extends WriteOptions>(
    installation: string,
    capability: string,
    args: CapabilityArgs,
    options: O,
  ): Promise<WriteResult<O>> {
    return this.write(installation, capability, 'enable', args, options);
  }

  reconcileCapability<O extends WriteOptions>(
    installation: string,
    capability: string,
    args: CapabilityArgs,
    options: O,
  ): Promise<WriteResult<O>> {
    return this.write(installation, capability, 'reconcile', args, options);
  }

  verifyCapability(
    installation: string,
    capability: string,
    args: CapabilityArgs = {},
  ): Promise<VerifyResult> {
    return this.request(
      this.capabilityPath(installation, capability, 'verify'),
      { method: 'POST', body: args },
    );
  }

  listActions(filter: {
    installation?: string;
    capability?: string;
  }): Promise<ActionListing> {
    return this.request('/actions', { query: filter });
  }

  getAction(name: string): Promise<Action> {
    return this.request(`/actions/${encodeURIComponent(name)}`);
  }

  private capabilityPath(
    installation: string,
    capability: string,
    action: string,
  ): string {
    return `/installations/${encodeURIComponent(
      installation,
    )}/capabilities/${encodeURIComponent(capability)}/${action}`;
  }

  /** One write of a capability: its arguments plus how it lands, as given. */
  private write<T>(
    installation: string,
    capability: string,
    action: string,
    args: CapabilityArgs,
    options: WriteOptions,
  ): Promise<T> {
    return this.request(this.capabilityPath(installation, capability, action), {
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
    const baseUrl = await this.discoveryApi.getBaseUrl('platform-capabilities');
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
