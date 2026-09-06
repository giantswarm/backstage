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
 *
 * The reason is built from error *codes* only, never from error messages:
 * Node's messages embed the hostname (`getaddrinfo ENOTFOUND <host>`), and the
 * probed URLs derive from `baseDomain`, which is backend-only because it
 * deanonymises installations. Callers may safely forward the reason to a
 * frontend.
 */

export const DEFAULT_PROBE_TIMEOUT_MS = 3_000;

export type EndpointProbeResult = {
  reachable: boolean;
  /**
   * Why the endpoint is unreachable, as one line naming the failure class and
   * the error code. Absent when reachable. Never quotes the URL or the host.
   */
  reason?: string;
  /** Epoch milliseconds at which the probe settled. */
  checkedAt: number;
};

export type ProbeEndpointOptions = {
  /** Budget for the whole request, DNS and TLS included. Default 3 s. */
  timeoutMs?: number;
  /** Overridable for tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /** Overridable clock for tests. */
  now?: () => number;
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
 * One line naming why a probe failed. Codes only -- see the module note on why
 * messages are never quoted.
 */
export function classifyProbeFailure(
  error: unknown,
  timeoutMs: number,
): string {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  if (name === 'AbortError' || name === 'TimeoutError') {
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
    return {
      reachable: false,
      reason: classifyProbeFailure(error, timeoutMs),
      checkedAt: now(),
    };
  } finally {
    clearTimeout(timer);
  }
}
