import { Agent, fetch as undiciFetch, getGlobalDispatcher } from 'undici';

/**
 * How long a connection to a muster may take to open. A muster that does not
 * accept one within this is not going to, and the MCP client opens more than
 * one before it gives up: its protocol discovery, then its fallback to
 * `initialize`, each wait out the timeout (undici's default is 10 s). Only the
 * connection is bounded, not the call, so a long tool call keeps its time.
 */
export const MUSTER_CONNECT_TIMEOUT_MS = 5_000;

/**
 * The fetch the MCP transports to muster use: undici's own, with a dispatcher
 * whose connect timeout is `connectTimeoutMs`. Node's built-in `fetch`
 * bundles an older undici, which refuses a dispatcher of the undici package.
 *
 * When the backend's global dispatcher is not undici's plain `Agent` (an
 * egress proxy, installed by `configureFetchProxy` of `backend-common`), the
 * requests go through it, at its own connect timeout: a dispatcher of this
 * module's own would go around the proxy. The check relies on this undici
 * having filled the global dispatcher slot first, which `@internal/backend-common`
 * does when the backend imports it, before any plugin; another undici there
 * fails safe, as the shared dispatcher at undici's 10 s default.
 */
export function createMusterFetch(
  connectTimeoutMs: number = MUSTER_CONNECT_TIMEOUT_MS,
): typeof fetch {
  const direct = new Agent({ connect: { timeout: connectTimeoutMs } });
  const musterFetch = (
    input: Parameters<typeof undiciFetch>[0],
    init?: Parameters<typeof undiciFetch>[1],
  ) => {
    const shared = getGlobalDispatcher();
    return undiciFetch(input, {
      ...init,
      dispatcher: shared instanceof Agent ? direct : shared,
    });
  };
  return musterFetch as unknown as typeof fetch;
}
