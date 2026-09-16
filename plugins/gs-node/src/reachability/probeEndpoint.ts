/**
 * Unauthenticated endpoint reachability probe.
 *
 * The portal acts as the person: no ServiceAccount, bot or App credential ever
 * reaches another installation, and the backend holds no per-user token for
 * any installation but its own. The one thing a backend can know without a
 * person is whether a route exists at all. So this probe carries **no
 * credentials and no user data** -- it is a plain GET whose answer is read only
 * for the fact that something answered. It performs no action on the target.
 *
 * Classification:
 * - any HTTP status (200, 401, 403, 404, 5xx, a redirect) means the route
 *   exists and the portal can reach it: `reachable: true`. A 401 or 403 from
 *   the gate in front of the service is the normal answer and proves the route.
 * - a DNS failure, a refused or reset connection, a TLS handshake or trust
 *   failure, or no answer within the timeout means the portal cannot reach it:
 *   `reachable: false` with a one-line `reason` naming the failure class.
 * - no answer within the timeout while this process was too busy to have
 *   noticed one is `reachable: false` **and `inconclusive`**: the timeout
 *   measured the process, not the endpoint (see
 *   {@link STARVED_LOOP_UTILIZATION}), and a cache records nothing for it.
 *
 * The reason is built from error *codes* only, never from error messages:
 * Node's messages embed the hostname (`getaddrinfo ENOTFOUND <host>`), and the
 * probed URLs derive from `baseDomain`, which is backend-only because it
 * deanonymises installations. Callers may safely forward the reason to a
 * frontend.
 */

import { performance } from 'node:perf_hooks';

export const DEFAULT_PROBE_TIMEOUT_MS = 3_000;

/**
 * Share of a probe's window during which this process's event loop was busy
 * above which a timeout is attributed to the process rather than the endpoint.
 *
 * The abort timer and the answer's I/O callback both wait for a turn of the
 * event loop, and timers are served before I/O. When the loop has been
 * saturated for most of the budget -- a pod starting up under a CPU quota,
 * every plugin initialising at once and the process throttled half the time --
 * the timer's turn comes first even though the answer arrived; the same
 * endpoint answers the same process in well under a second once it is idle.
 * Such a timeout says nothing about the endpoint, so it is reported
 * inconclusive instead of as "not reachable" (which a cache would then serve
 * for minutes and a browser for an hour). An idle answer takes a fraction of
 * the budget, so for it to be missed the loop must have been unavailable for
 * most of the window; 80 % leaves room for a merely busy backend to still
 * conclude.
 */
export const STARVED_LOOP_UTILIZATION = 0.8;

export type EndpointProbeResult = {
  reachable: boolean;
  /**
   * Why the endpoint is unreachable, as one line naming the failure class and
   * the error code. Absent when reachable. Never quotes the URL or the host.
   */
  reason?: string;
  /** Epoch milliseconds at which the probe settled. */
  checkedAt: number;
  /**
   * The probe ran out of budget while this process's event loop was busy for
   * at least {@link STARVED_LOOP_UTILIZATION} of the window, so the timeout
   * says more about the process than about the endpoint. Only ever set
   * together with `reachable: false`. A cache records nothing for such an
   * answer and probes again on the next ask.
   */
  inconclusive?: true;
};

/**
 * Measures how busy this process's event loop is over a probe's window:
 * calling the meter starts a measurement, calling the function it returns
 * answers with the utilization since then (0 idle .. 1 fully busy).
 */
export type LoopUtilizationMeter = () => () => number;

/**
 * The default meter: Node's own event-loop utilization, the share of wall
 * time the loop spent running callbacks rather than waiting for events. Time
 * the kernel withholds from a throttled process inside a callback counts as
 * busy, which is exactly the starvation the meter is there to notice.
 */
export const eventLoopUtilizationMeter: LoopUtilizationMeter = () => {
  const since = performance.eventLoopUtilization();
  return () => performance.eventLoopUtilization(since).utilization;
};

export type ProbeEndpointOptions = {
  /** Budget for the whole request, DNS and TLS included. Default 3 s. */
  timeoutMs?: number;
  /** Overridable for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /** Overridable clock for tests. */
  now?: () => number;
  /** Overridable for tests; defaults to {@link eventLoopUtilizationMeter}. */
  loopMeter?: LoopUtilizationMeter;
};

/** Node error codes that mean the name could not be resolved. */
const DNS_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EAI_NONAME']);

/**
 * Whether an error code names a TLS handshake or certificate-trust failure.
 * OpenSSL codes (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `CERT_HAS_EXPIRED`,
 * `DEPTH_ZERO_SELF_SIGNED_CERT`, `HOSTNAME_MISMATCH`, …), Node's `ERR_TLS_*` /
 * `ERR_SSL_*` / `ERR_OSSL_*` families, and `EPROTO` (a handshake against
 * something that does not speak TLS).
 */
export function isTlsErrorCode(code: string): boolean {
  return (
    code.startsWith('ERR_TLS_') ||
    code.startsWith('ERR_SSL_') ||
    code.startsWith('ERR_OSSL_') ||
    code === 'EPROTO' ||
    /CERT|SIGNATURE|HOSTNAME_MISMATCH|SELF_SIGNED/.test(code)
  );
}

/**
 * The most specific error code in an error's `cause` chain. undici wraps
 * connection failures as `TypeError: fetch failed` with the socket error as
 * `cause`, and a cause can itself carry a cause.
 */
export function errorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && candidate.code) {
      return candidate.code;
    }
    current = candidate.cause;
  }
  return undefined;
}

/**
 * Whether an error is the probe's own deadline firing: the abort of a fetch
 * (`AbortError`) or of an `AbortSignal.timeout` (`TimeoutError`).
 */
export function isProbeTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/**
 * The result of a probe that ran out of budget: not reachable -- unless this
 * process's event loop was busy for {@link STARVED_LOOP_UTILIZATION} of the
 * window, in which case the answer is inconclusive and the reason says so.
 * `loopUtilization` is what the probe's meter measured; it is rounded to a
 * percentage in the reason, and nothing in the reason names the endpoint.
 */
export function timedOutResult(
  timeoutMs: number,
  loopUtilization: number,
  checkedAt: number,
): EndpointProbeResult {
  const reason = `no answer within ${timeoutMs} ms`;
  if (loopUtilization >= STARVED_LOOP_UTILIZATION) {
    const percent = Math.round(loopUtilization * 100);
    return {
      reachable: false,
      reason: `${reason} while this process was busy (event loop ${percent}% utilised)`,
      checkedAt,
      inconclusive: true,
    };
  }
  return { reachable: false, reason, checkedAt };
}

/**
 * One line naming why a probe failed. Codes only -- see the module note on why
 * messages are never quoted.
 */
export function classifyProbeFailure(
  error: unknown,
  timeoutMs: number,
): string {
  if (isProbeTimeout(error)) {
    return `no answer within ${timeoutMs} ms`;
  }

  const code = errorCode(error);
  if (!code) {
    return 'connection failed';
  }
  if (DNS_CODES.has(code)) {
    return `DNS lookup failed (${code})`;
  }
  if (code === 'ECONNREFUSED') {
    return 'connection refused (ECONNREFUSED)';
  }
  if (code === 'ECONNRESET') {
    return 'connection reset (ECONNRESET)';
  }
  if (code === 'ETIMEDOUT') {
    return 'connection timed out (ETIMEDOUT)';
  }
  if (code === 'EHOSTUNREACH' || code === 'ENETUNREACH') {
    return `host unreachable (${code})`;
  }
  if (isTlsErrorCode(code)) {
    return `TLS handshake failed (${code})`;
  }
  return `connection failed (${code})`;
}

/**
 * GET `url` once, without credentials, and report whether anything answered.
 *
 * `redirect: 'manual'` so a gate that redirects into a sign-in page counts as
 * an answer from the route (which it is) instead of being followed to a third
 * host. The response body is discarded unread; only the fact of a response is
 * used.
 */
export async function probeEndpoint(
  url: string,
  options: ProbeEndpointOptions = {},
): Promise<EndpointProbeResult> {
  const {
    timeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
    fetchFn = fetch,
    now = Date.now,
    loopMeter = eventLoopUtilizationMeter,
  } = options;

  try {
    // Fail before any network activity on a URL that cannot be probed, with a
    // reason that does not echo the string back.
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    return {
      reachable: false,
      reason: 'invalid endpoint URL',
      checkedAt: now(),
    };
  }

  const loopBusy = loopMeter();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      // Deliberately no Authorization, no cookies, no identifying header: the
      // probe carries nothing about the portal's users.
      headers: { Accept: 'application/json' },
    });
    // Release the connection without reading the body; the status is the
    // whole answer. A body that cannot be cancelled changes nothing.
    await response.body?.cancel().catch(() => undefined);
    return { reachable: true, checkedAt: now() };
  } catch (error) {
    if (isProbeTimeout(error)) {
      return timedOutResult(timeoutMs, loopBusy(), now());
    }
    return {
      reachable: false,
      reason: classifyProbeFailure(error, timeoutMs),
      checkedAt: now(),
    };
  } finally {
    clearTimeout(timer);
  }
}
