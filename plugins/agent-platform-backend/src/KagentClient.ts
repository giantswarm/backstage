import { LoggerService } from '@backstage/backend-plugin-api';
import { Config } from '@backstage/config';
import {
  AuthenticationError,
  NotAllowedError,
  NotFoundError,
} from '@backstage/errors';

/**
 * Header the agent-platform frontend uses to forward the user's
 * per-installation Dex OIDC ID token, which this proxy sets as
 * `Authorization: Bearer` toward kagent.
 *
 * Mirrors muster's `backstage-muster-authorization`: kept off `Authorization`
 * because that header carries the Backstage identity on the inbound leg.
 *
 * Must match KAGENT_AUTH_HEADER in plugins/agent-platform.
 */
export const KAGENT_AUTH_HEADER = 'backstage-kagent-authorization';

/** Default per-request timeout toward a kagent API. */
export const DEFAULT_KAGENT_TIMEOUT_MS = 10_000;

/** One installation's kagent endpoint. */
export interface KagentInstallationConfig {
  /** Installation name, as in `gs.installations`. */
  name: string;
  /**
   * kagent API base URL, no trailing slash — e.g.
   * `https://kagent.<baseDomain>/api`.
   */
  apiBaseUrl: string;
}

export interface KagentRequestOptions {
  /**
   * The user's Dex ID token, forwarded as `Authorization: Bearer` toward
   * kagent. Optional because `/version` and `/me` are useful even when no
   * token could be minted; `/sessions` requires one.
   */
  userToken?: string;
}

/**
 * Derive the kagent API base URL for an installation from its base domain.
 *
 * The hostname pattern matches the `agentic-platform-connectivity` chart's
 * `kagent.uiRoute.hostname` (`kagent.<codename>.<base>`), which is exactly
 * `kagent.<baseDomain>` — the same derivation `useAgentAvatarUrl` uses for
 * `avatars.<baseDomain>`. That host is fronted by oauth2-proxy, whose nginx
 * sidecar proxies `/api/` to `kagent-controller:8083`.
 *
 * Returns undefined when the installation has no `baseDomain`.
 */
export function deriveKagentApiBaseUrl(
  baseDomain: string | undefined,
): string | undefined {
  if (!baseDomain) {
    return undefined;
  }
  return `https://kagent.${baseDomain}/api`;
}

/** Strip trailing slashes so URL joining stays predictable. */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * kagent answered (or was reachable) and then failed: a 5xx, a 429, a timeout, or
 * a body that could not be read.
 *
 * Deliberately **not** the same error as "kagent is absent". That case is a 404
 * (see the catch block in `request`): silenced by the frontend, and below the
 * `>= 500` threshold at which `MiddlewareFactory.error()` logs to Sentry, which
 * matters because it is the expected outcome on most installations.
 *
 * This one surfaces as a 500, so the frontend reports it *and* it reaches Sentry —
 * both correct here. A deployed-but-degraded kagent is rare and genuinely
 * actionable, and its sessions silently vanishing from the fleet-merged list would
 * be the worse failure.
 */
function upstreamError(message: string): Error {
  const error = new Error(message);
  error.name = 'UpstreamError';
  return error;
}

/** Whether a configured URL is absolute and http(s), so `fetch` can use it. */
function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Resolve the installations this proxy can target, keyed by name.
 *
 * `agentPlatform.kagent.installations`, when present, acts as the allowlist and
 * each entry's `apiBaseUrl` overrides the derived URL. When absent, every
 * `gs.installations` entry with a `baseDomain` is derived — kagent is only
 * deployed on some installations, and the ones without it simply fail per
 * request and are reported as "not installed".
 *
 * Installations that resolve to no URL are logged once at init and omitted.
 */
export function readKagentInstallationsFromConfig(
  config: Config,
  logger: LoggerService,
): Map<string, KagentInstallationConfig> {
  const result = new Map<string, KagentInstallationConfig>();

  const gsInstallations = config.getOptionalConfig('gs.installations');
  const baseDomains = new Map<string, string | undefined>();
  for (const name of gsInstallations?.keys() ?? []) {
    baseDomains.set(
      name,
      gsInstallations?.getOptionalString(`${name}.baseDomain`),
    );
  }

  const overrides = config.getOptionalConfig(
    'agentPlatform.kagent.installations',
  );
  // The explicit block is the allowlist when present; otherwise fan out to the
  // whole configured fleet.
  const names = overrides ? overrides.keys() : [...baseDomains.keys()];

  for (const name of names) {
    const explicitUrl = overrides?.getOptionalString(`${name}.apiBaseUrl`);
    const apiBaseUrl =
      explicitUrl ?? deriveKagentApiBaseUrl(baseDomains.get(name));

    if (!apiBaseUrl) {
      logger.info(
        `Skipping kagent proxy for installation '${name}': no apiBaseUrl configured and no baseDomain to derive one from.`,
      );
      continue;
    }

    // Reject a non-absolute URL here rather than letting it fail per request:
    // an operator omitting the scheme would otherwise surface as an opaque
    // fetch failure on every call instead of one clear message at startup.
    if (!isAbsoluteHttpUrl(apiBaseUrl)) {
      logger.warn(
        `Skipping kagent proxy for installation '${name}': apiBaseUrl must be an absolute http(s) URL.`,
        { apiBaseUrl },
      );
      continue;
    }

    result.set(name, {
      name,
      apiBaseUrl: stripTrailingSlash(apiBaseUrl),
    });
  }

  return result;
}

/**
 * Thin HTTP client for one installation's kagent REST API.
 *
 * Deliberately a byte-for-byte proxy: it returns kagent's JSON verbatim,
 * without unwrapping the `{error, data, message}` envelope, stripping unknown
 * fields, or filtering anything. Schema tolerance lives in the frontend, so a
 * kagent schema change never requires a backend release. The split is:
 * backend = transport, frontend = schema.
 */
export class KagentClient {
  constructor(
    private readonly installation: KagentInstallationConfig,
    private readonly logger: LoggerService,
    /** Overridable for tests; defaults to the global fetch. */
    private readonly fetchFn: typeof fetch = fetch,
    private readonly timeoutMs: number = DEFAULT_KAGENT_TIMEOUT_MS,
  ) {}

  /** `GET <apiBaseUrl>/sessions` — the user's sessions, kagent's JSON verbatim. */
  async listSessions(options: KagentRequestOptions): Promise<unknown> {
    return this.request(`${this.installation.apiBaseUrl}/sessions`, options);
  }

  // There is deliberately no version probe. kagent serves `/version` at the
  // server root (`APIPathVersion`), not under `/api`, and neither door we
  // support routes the root to the controller:
  //
  // - The derived door's nginx sidecar (`helm/kagent/files/nginx.conf`) proxies
  //   only `location /api/` to `kagent-controller:8083`; `location /` goes to
  //   the kagent UI, which answers with HTML — which our non-JSON guard would
  //   then report as a sign-in page on a perfectly healthy installation.
  // - The agentgateway override matches on the `/kagent` path prefix, so a
  //   root-relative `/version` does not match its HTTPRoute at all.
  //
  // Nothing under `/api` exposes the controller version either (the `Version`
  // fields in `/api/substrate/status` are per-actor, not the controller's), so
  // there is nothing reachable to probe. Version *tolerance* does not depend on
  // this — it lives in the frontend's permissive parsing. If a future feature
  // needs version gating, probe by behaviour (call a version-specific endpoint
  // and treat 404 as "absent") rather than by version string.

  /**
   * `GET <apiBaseUrl>/me` — the identity kagent resolved for the forwarded
   * token. Used to detect the controller's auth mode: under `trusted-proxy` it
   * reflects the caller's claims, while under `unsecure` kagent ignores the
   * token and falls back to a shared default user.
   */
  async getMe(options: KagentRequestOptions): Promise<unknown> {
    return this.request(`${this.installation.apiBaseUrl}/me`, options);
  }

  private async request(
    url: string,
    options: KagentRequestOptions,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        headers: {
          Accept: 'application/json',
          ...(options.userToken && {
            Authorization: `Bearer ${options.userToken}`,
          }),
        },
        // Do NOT follow oauth2-proxy's redirect into Dex: a 3xx here means the
        // forwarded token was not accepted, and following it would yield an
        // HTML sign-in page with a 200.
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // A timeout means something *is* listening but did not answer in time —
      // kagent is deployed and unwell, not absent. That must not be swallowed as
      // "no kagent here", so it becomes an upstream failure the frontend
      // surfaces. `AbortSignal.timeout` rejects with a TimeoutError.
      if ((error as Error)?.name === 'TimeoutError') {
        this.logger.debug(
          `kagent request timed out for installation '${this.installation.name}'`,
          { timeoutMs: this.timeoutMs },
        );
        throw upstreamError(
          `The kagent API for installation '${this.installation.name}' did not respond within ${this.timeoutMs}ms.`,
        );
      }

      // DNS failure, TLS error or connection refused: nothing is reachable at
      // that host, i.e. kagent is not deployed on this installation. On a fleet
      // where only a couple of installations run kagent, this is the *normal,
      // expected* outcome for most of them on every page view.
      //
      // It must therefore be a 404 and not a 503. `MiddlewareFactory.error()`
      // logs `logger.error` for any status >= 500, and the root logger forwards
      // warn/error to Sentry — so a 503 here would raise one Sentry event per
      // kagent-less installation per page view, per user, fanned out into a
      // separate issue per installation name. Logging the cause at debug does
      // not prevent that; only not throwing a 5xx does.
      //
      // 404 also matches what the frontend already does with kagent's own 404:
      // treat it as "no kagent API here" and stay silent. The two cases carried
      // no distinguishable meaning, so collapsing them loses nothing.
      this.logger.debug(
        `kagent is not reachable for installation '${this.installation.name}'`,
        { error: String(error) },
      );
      throw new NotFoundError(
        `The kagent API is not available for installation '${this.installation.name}'.`,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      throw new AuthenticationError(
        `The kagent API for installation '${this.installation.name}' redirected to a sign-in page; the forwarded token was not accepted.`,
      );
    }

    if (response.status === 401) {
      throw new AuthenticationError(
        `Not authenticated against the kagent API for installation '${this.installation.name}'.`,
      );
    }

    if (response.status === 403) {
      throw new NotAllowedError(
        `Not authorized to read the kagent API for installation '${this.installation.name}'.`,
      );
    }

    if (response.status === 404) {
      throw new NotFoundError(
        `The kagent API is not available for installation '${this.installation.name}'.`,
      );
    }

    if (!response.ok) {
      // Anything else non-ok (5xx, 429, …) means kagent or its ingress answered
      // and failed. It is deployed but unwell, so this must NOT share
      // ServiceUnavailableError with "host unreachable" — the frontend silences
      // that one, which would make a degraded kagent look like an empty account.
      this.logger.debug(
        `kagent API returned an error status for installation '${this.installation.name}'`,
        { status: response.status },
      );
      throw upstreamError(
        `The kagent API for installation '${this.installation.name}' returned status ${response.status}.`,
      );
    }

    // A 2xx with a non-JSON body is oauth2-proxy serving its sign-in page
    // rather than kagent answering.
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      throw new AuthenticationError(
        `The kagent API for installation '${this.installation.name}' returned a non-JSON response (content-type '${contentType}'), which usually means a sign-in page was served instead.`,
      );
    }

    // Reading the body is a second chance to fail: the abort signal is still
    // armed after the headers arrive, so a slow or large response can abort
    // mid-stream, the connection can reset, or the body can be truncated /
    // invalid JSON. kagent answered in all of those cases, so they are upstream
    // failures worth surfacing — not "kagent isn't deployed here".
    try {
      return await response.json();
    } catch (error) {
      this.logger.debug(
        `Failed to read the kagent API response body for installation '${this.installation.name}'`,
        { error: String(error) },
      );
      throw upstreamError(
        `Could not read the response from the kagent API for installation '${this.installation.name}'.`,
      );
    }
  }
}
