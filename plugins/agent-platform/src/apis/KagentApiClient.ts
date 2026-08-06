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
import {
  KagentSessionDetail,
  normalizeSessionDetail,
  normalizeTaskList,
} from '../lib/kagentSessionDetail';
import { A2aTaskWire } from '../lib/kagentTaskSchema';
import { KAGENT_AUTH_HEADER, KagentApi, KagentIdentity } from './types';

export const kagentApiRef = createApiRef<KagentApi>({
  id: 'plugin.agent-platform.kagent',
});

/**
 * Drift already reported, keyed by installation + **endpoint** + drift *kind*.
 *
 * Keying on the kind rather than the formatted message matters in both
 * directions: `skipped-rows` messages embed a varying count, so a message key
 * would report the same problem repeatedly, while a bounded set of kinds keeps
 * this from growing without limit in a tab left open for days.
 *
 * The endpoint is in the key because three reads now share this set and all three
 * can emit `skipped-rows`. Without it, whichever fired first would permanently
 * silence the others for that installation — so a session list that dropped one
 * row would mute a task list that later dropped thirty, and the timeline would
 * render half a conversation with nothing logged anywhere.
 */
const reportedDrift = new Set<string>();

/**
 * An error the caller's failure path will surface.
 *
 * `UpstreamError` is deliberate: the sessions provider treats `NotFoundError` and
 * `ServiceUnavailableError` as "kagent isn't deployed here" and stays silent, so
 * a read that genuinely failed must not borrow either name.
 */
function upstreamError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstreamError';
  return error;
}

/**
 * A kagent envelope reporting a failure in-band on an otherwise successful
 * response.
 *
 * Deliberately narrow — `error === true` and nothing else. The reads go through
 * the zod layer for this; the write path has no payload to parse, so it checks the
 * one field that can turn a 200 into a failure.
 */
function isErrorEnvelope(body: unknown): body is Record<string, unknown> {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  return (body as { error?: unknown }).error === true;
}

/** Which read produced the drift — part of the dedupe key and of the message. */
type DriftSource = 'sessions' | 'session' | 'session tasks';

function reportDrift(
  installation: string,
  source: DriftSource,
  drift: SessionListDrift,
) {
  const key = `${installation}:${source}:${drift.kind}`;
  if (reportedDrift.has(key)) {
    return;
  }
  reportedDrift.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `kagent ${source} response drift on installation '${installation}': ${drift.message}`,
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
      reportDrift(installation, 'sessions', drift);
    }

    // Two drift kinds mean we cannot claim to have read this installation's
    // sessions, so they must reach the caller's failure path rather than
    // resolving as an empty list:
    //
    // - `error-envelope`: kagent reported a failure in-band on a 200. Resolving
    //   with [] would be indistinguishable from "this user has no sessions".
    // - `data-not-array`: the contract moved and we dropped every row.
    //
    // A console warning alone is not enough — nobody is watching it. Throwing
    // puts the installation into `unreachableInstallations`, which is visible.
    //
    // `skipped-rows` deliberately does *not* throw: partial data is still worth
    // showing, and the warning records what was dropped.
    if (drift?.kind === 'error-envelope' || drift?.kind === 'data-not-array') {
      throw upstreamError(drift.message);
    }

    return sessions;
  }

  async getSessionDetail(
    installation: string,
    sessionId: string,
  ): Promise<KagentSessionDetail | undefined> {
    const body = await this.get<unknown>(
      `/kagent/sessions/${encodeURIComponent(sessionId)}`,
      installation,
    );
    const { detail, drift } = normalizeSessionDetail(body, installation);

    if (drift) {
      reportDrift(installation, 'session', drift);
    }

    // Same reasoning as `listSessions`: an in-band error on a 200 must reach the
    // caller's failure path, or a broken read looks like a missing session.
    if (
      drift?.kind === 'error-envelope' ||
      drift?.kind === 'unparseable-body'
    ) {
      throw upstreamError(drift.message);
    }

    // `undefined` rather than a throw when the body was readable but held no
    // session: that is the same condition as a 404, and the page renders one
    // "not found" state for both.
    return detail;
  }

  async listSessionTasks(
    installation: string,
    sessionId: string,
  ): Promise<A2aTaskWire[]> {
    const body = await this.get<unknown>(
      `/kagent/sessions/${encodeURIComponent(sessionId)}/tasks`,
      installation,
    );
    const { tasks, drift } = normalizeTaskList(body);

    if (drift) {
      reportDrift(installation, 'session tasks', drift);
    }

    if (
      drift?.kind === 'error-envelope' ||
      drift?.kind === 'data-not-array' ||
      drift?.kind === 'unparseable-body'
    ) {
      throw upstreamError(drift.message);
    }

    // A session with no tasks is ordinary — created but never run — so an empty
    // list is a success, not a drift.
    return tasks;
  }

  async deleteSession(installation: string, sessionId: string): Promise<void> {
    const { url, headers } = await this.prepare(
      `/kagent/sessions/${encodeURIComponent(sessionId)}`,
      installation,
    );
    const response = await this.fetchApi.fetch(url, {
      method: 'DELETE',
      headers,
    });

    await this.throwIfNotOk(response);

    // The body is read but not required. kagent answers 200 with its usual
    // `{error, data, message}` envelope, and the envelope carries nothing worth
    // returning — but a `200 error: true` would be a failure reported in-band, the
    // same shape the session and list readers already refuse to treat as success.
    // A version that answered 204, or an empty body, still counts as a success:
    // requiring JSON here would fail a delete that actually happened.
    const body = await response.json().catch(() => undefined);
    if (isErrorEnvelope(body)) {
      throw upstreamError(
        typeof body.message === 'string' && body.message
          ? body.message
          : 'kagent reported an error while deleting the session, without saying what.',
      );
    }
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

  /** GET a backend route, forwarding the target installation's Dex token. */
  private async get<T>(
    path: string,
    installation?: string,
    options: { tokenRequired?: boolean } = {},
  ): Promise<T> {
    const { url, headers } = await this.prepare(
      path,
      installation,
      options.tokenRequired ?? true,
    );
    const response = await this.fetchApi.fetch(url, { headers });
    return this.handleResponse<T>(response);
  }

  /**
   * Resolve a backend route to a URL and headers, minting the installation's Dex
   * token on the way.
   *
   * The token is minted lazily, per call: a mint failure then fails only this
   * installation's request, which is what lets the fleet fan-out degrade one
   * installation at a time.
   *
   * `tokenRequired: false` mirrors the backend routes that read the token
   * optionally — the request still goes out without it rather than failing
   * before it is sent.
   */
  private async prepare(
    path: string,
    installation?: string,
    tokenRequired: boolean = true,
  ): Promise<{ url: string; headers: Record<string, string> }> {
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

    return { url: url.toString(), headers };
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
    await this.throwIfNotOk(response);
    return response.json() as Promise<T>;
  }

  /** {@link handleResponse}'s status handling, shared with the write path. */
  private async throwIfNotOk(response: Response): Promise<void> {
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
  }
}
