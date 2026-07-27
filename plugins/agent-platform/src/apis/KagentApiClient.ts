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
import { kagentMeWireSchema } from '../lib/kagentSchema';
import {
  KagentSession,
  normalizeSessionList,
  SessionListDrift,
} from '../lib/kagentSessions';
import { KAGENT_AUTH_HEADER, KagentApi, KagentIdentity } from './types';

export const kagentApiRef = createApiRef<KagentApi>({
  id: 'plugin.agent-platform.kagent',
});

/** Drift is worth knowing about, but only once per message per page-session. */
/**
 * Drift already reported, keyed by installation + drift *kind*.
 *
 * Keying on the kind rather than the formatted message matters in both
 * directions: `skipped-rows` messages embed a varying count, so a message key
 * would report the same problem repeatedly, while a bounded set of kinds keeps
 * this from growing without limit in a tab left open for days.
 */
const reportedDrift = new Set<string>();

function reportDrift(installation: string, drift: SessionListDrift) {
  const key = `${installation}:${drift.kind}`;
  if (reportedDrift.has(key)) {
    return;
  }
  reportedDrift.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `kagent sessions response drift on installation '${installation}': ${drift.message}`,
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

  async getIdentity(installation: string): Promise<KagentIdentity> {
    // Best-effort token: the backend reads it as optional here, so a broker or
    // Dex-session failure must not stop the probe. This is the one installation
    // where the answer matters most — an `unsecure` deployment presenting a
    // shared list as the user's own — so losing the diagnostic to a mint failure
    // would be exactly the wrong trade.
    const body = await this.get<unknown>('/kagent/me', installation, {
      tokenRequired: false,
    });
    const parsed = kagentMeWireSchema.safeParse(body);
    return { sub: parsed.success ? parsed.data.sub : undefined };
  }

  /**
   * GET a backend route, forwarding the target installation's Dex token.
   *
   * The token is minted lazily, per call: a mint failure then fails only this
   * installation's request, which is what lets the fleet fan-out degrade one
   * installation at a time.
   *
   * `tokenRequired: false` mirrors the backend routes that read the token
   * optionally — the request still goes out without it rather than failing
   * before it is sent.
   */
  private async get<T>(
    path: string,
    installation?: string,
    options: { tokenRequired?: boolean } = {},
  ): Promise<T> {
    const { tokenRequired = true } = options;
    const baseUrl = await this.discoveryApi.getBaseUrl('agent-platform');
    const url = new URL(`${baseUrl}${path}`);

    const headers: Record<string, string> = {};
    if (installation) {
      url.searchParams.set('installation', installation);
      const token = await this.mintToken(installation, tokenRequired);
      if (token) {
        headers[KAGENT_AUTH_HEADER] = token;
      }
    }

    const response = await this.fetchApi.fetch(url.toString(), { headers });
    return this.handleResponse<T>(response);
  }

  private async mintToken(
    installation: string,
    required: boolean,
  ): Promise<string | undefined> {
    if (required) {
      return getInstallationOidcToken(
        this.kubernetesApi,
        this.kubernetesAuthProvidersApi,
        installation,
      );
    }
    try {
      return await getInstallationOidcToken(
        this.kubernetesApi,
        this.kubernetesAuthProvidersApi,
        installation,
      );
    } catch {
      return undefined;
    }
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
      // A 400 from this proxy means the backend has no kagent endpoint
      // configured for the requested installation (its `resolveInstallation`
      // raises InputError for a name outside the allowlist). That allowlist is
      // `gs.installations` entries with a `baseDomain`, which is not the same set
      // as the installations the frontend considers reachable — so this is
      // ordinary operation, not a coding error, and belongs on the same silent
      // "kagent isn't available here" path as a 404. Left unmapped it would be
      // retried with backoff and surfaced to the user as a read failure.
      if (response.status === 400) {
        error.name = 'NotFoundError';
      }
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
