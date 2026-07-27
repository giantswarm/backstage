import {
  createApiRef,
  DiscoveryApi,
  FetchApi,
} from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import { getInstallationOidcToken } from '../lib/installationOidcToken';
import {
  kagentMeWireSchema,
  kagentVersionWireSchema,
} from '../lib/kagentSchema';
import { KagentSession, normalizeSessionList } from '../lib/kagentSessions';
import { KAGENT_AUTH_HEADER, KagentApi, KagentIdentity } from './types';

export const kagentApiRef = createApiRef<KagentApi>({
  id: 'plugin.agent-platform.kagent',
});

/** Drift is worth knowing about, but only once per message per page-session. */
const reportedDrift = new Set<string>();

function reportDrift(installation: string, drift: string) {
  const key = `${installation}:${drift}`;
  if (reportedDrift.has(key)) {
    return;
  }
  reportedDrift.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `kagent sessions response drift on installation '${installation}': ${drift}`,
  );
}

/**
 * Client for the kagent REST API, via the agent-platform-backend proxy.
 *
 * Two responsibilities beyond plain fetching:
 *
 * - **Per-installation auth.** Every installation has its own Dex, so a token is
 *   minted per request for the target installation and forwarded in
 *   `KAGENT_AUTH_HEADER`. Tokens are never cached here: callers put results in a
 *   react-query cache that is persisted to localStorage, and a credential must
 *   not be written to disk.
 * - **Schema tolerance.** Responses are normalized through the zod layer, so a
 *   kagent version difference between installations stays out of the UI.
 */
export class KagentApiClient implements KagentApi {
  private readonly discoveryApi: DiscoveryApi;
  private readonly fetchApi: FetchApi;
  private readonly kubernetesApi: KubernetesApi;
  private readonly kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;

  constructor(options: {
    discoveryApi: DiscoveryApi;
    fetchApi: FetchApi;
    kubernetesApi: KubernetesApi;
    kubernetesAuthProvidersApi: KubernetesAuthProvidersApi;
  }) {
    this.discoveryApi = options.discoveryApi;
    this.fetchApi = options.fetchApi;
    this.kubernetesApi = options.kubernetesApi;
    this.kubernetesAuthProvidersApi = options.kubernetesAuthProvidersApi;
  }

  async listInstallations(): Promise<string[]> {
    const body = await this.get<{ installations?: { name?: string }[] }>(
      '/kagent/installations',
    );
    return (body.installations ?? [])
      .map(installation => installation.name)
      .filter((name): name is string => Boolean(name));
  }

  async listSessions(installation: string): Promise<KagentSession[]> {
    const body = await this.get<unknown>('/kagent/sessions', installation);
    const { sessions, drift } = normalizeSessionList(body, installation);
    if (drift) {
      reportDrift(installation, drift);
    }
    return sessions;
  }

  async getVersion(installation: string): Promise<string | undefined> {
    const body = await this.get<unknown>('/kagent/version', installation);
    const parsed = kagentVersionWireSchema.safeParse(body);
    return parsed.success ? parsed.data.kagent_version : undefined;
  }

  async getIdentity(installation: string): Promise<KagentIdentity> {
    const body = await this.get<unknown>('/kagent/me', installation);
    const parsed = kagentMeWireSchema.safeParse(body);
    return { sub: parsed.success ? parsed.data.sub : undefined };
  }

  /**
   * GET a backend route, forwarding the target installation's Dex token.
   *
   * The token is minted lazily, per call: a mint failure then fails only this
   * installation's request, which is what lets the fleet fan-out degrade one
   * installation at a time.
   */
  private async get<T>(path: string, installation?: string): Promise<T> {
    const baseUrl = await this.discoveryApi.getBaseUrl('agent-platform');
    const url = new URL(`${baseUrl}${path}`);

    const headers: Record<string, string> = {};
    if (installation) {
      url.searchParams.set('installation', installation);
      headers[KAGENT_AUTH_HEADER] = await getInstallationOidcToken(
        this.kubernetesApi,
        this.kubernetesAuthProvidersApi,
        installation,
      );
    }

    const response = await this.fetchApi.fetch(url.toString(), { headers });
    return this.handleResponse<T>(response);
  }

  /**
   * Map status codes onto error names.
   *
   * These specific names matter twice over: the plugin's QueryClientProvider
   * short-circuits its retry predicate on them, and the sessions provider
   * classifies "kagent isn't deployed here" (404/503, silent) apart from "we
   * couldn't read it" (everything else, surfaced).
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message =
        (errorData as { error?: { message?: string } })?.error?.message ??
        `kagent request failed with status ${response.status}`;
      const error = new Error(message);
      if (response.status === 401) {
        error.name = 'UnauthorizedError';
      }
      if (response.status === 403) {
        error.name = 'ForbiddenError';
      }
      if (response.status === 404) {
        error.name = 'NotFoundError';
      }
      if (response.status === 503) {
        error.name = 'ServiceUnavailableError';
      }
      throw error;
    }
    return response.json() as Promise<T>;
  }
}
