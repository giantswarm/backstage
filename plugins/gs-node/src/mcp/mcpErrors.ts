/**
 * Recognising what `@ai-sdk/mcp` throws, and turning it into words for a
 * person. The SDK's errors are `MCPClientError`s (not exported from the
 * package's index) whose message starts with `MCP HTTP Transport Error:` for
 * anything the HTTP transport met; the HTTP status rides along as
 * `statusCode`. The strings below are the SDK's public error surface, so they
 * are stable across versions; if one ever changed we would stop recognising
 * that signal, not crash.
 */

// `MCPClientError({ message: 'Attempted to send a request from a closed
// client' })`, thrown from `request()` when `isClosed` is set.
const CLOSED_CLIENT_ERROR_FRAGMENT =
  'Attempted to send a request from a closed client';

const TRANSPORT_ERROR_PREFIX = 'MCP HTTP Transport Error';

/**
 * What a stateful streamable-http server (or the gateway in front of it)
 * answers when it no longer knows the client's MCP session: 404 on the id it
 * forgot (agentgateway `mcp: session not found`; the SDK appends its own
 * "The MCP session expired" hint), and 400 on the id-less request the client
 * sends after the SDK cleared the id (agentgateway `session header is required
 * for non-initialize requests`, the Python SDK `Missing session ID`), and 400
 * on an id the server cannot read any more (agentgateway `invalid session ID
 * header` after its session key rotated or its encoding changed).
 */
const LOST_SESSION_FRAGMENTS = [
  'session not found',
  'session header is required',
  'invalid session id',
  'missing session id',
  'the mcp session expired',
  'session terminated',
];

function messageOf(error: unknown): string {
  if (!error) return '';
  return error instanceof Error ? error.message : String(error);
}

function statusCodeOf(error: unknown): number | undefined {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  if (typeof status === 'number') return status;
  const match = /\(HTTP (\d{3})\)/.exec(messageOf(error));
  return match ? Number(match[1]) : undefined;
}

export function isClosedClientError(error: unknown): boolean {
  return messageOf(error).includes(CLOSED_CLIENT_ERROR_FRAGMENT);
}

/**
 * Whether the request failed because the server no longer knows this client's
 * MCP session. Such a request was rejected before it reached the tool, so it
 * is safe to run again on a fresh session — a mutation cannot have happened.
 *
 * A 404 on a request that carried a session id counts too: the SDK adds its
 * "session expired" hint only for the legacy protocol, and a wrong URL fails
 * at `initialize` (before any tool call), so a 404 on a tool call after a
 * successful `initialize` is a forgotten session.
 */
export function isLostSessionError(error: unknown): boolean {
  const message = messageOf(error).toLowerCase();
  if (LOST_SESSION_FRAGMENTS.some(fragment => message.includes(fragment))) {
    return true;
  }
  return statusCodeOf(error) === 404 && message.includes('posting to endpoint');
}

/** A lost session or a closed client: the tool call never happened. */
export function isRecoverableSessionError(error: unknown): boolean {
  return isClosedClientError(error) || isLostSessionError(error);
}

function isTransportError(error: unknown): boolean {
  if (!error) return false;
  const name = (error as { name?: unknown }).name;
  const message = messageOf(error);
  return (
    name === 'MCPClientError' ||
    message.startsWith(TRANSPORT_ERROR_PREFIX) ||
    isClosedClientError(error) ||
    // Node's fetch rejects with `TypeError: fetch failed` when the endpoint
    // cannot be reached at all; the SDK lets that one through unchanged.
    (name === 'TypeError' && message === 'fetch failed')
  );
}

function connectionFailureCode(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown } | null)?.cause;
  const code = (cause as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * The plain words for a failed MCP request, or `undefined` when `error` is not
 * the transport's (a tool-level error, a Backstage error, ...) and must reach
 * the caller unchanged. A 401 is also left alone: the frontend recognises the
 * transport's `HTTP 401` text as "sign in to muster" (its `isMusterAuthError`),
 * and that path stays as it is.
 */
export function describeMcpFailure(error: unknown): string | undefined {
  if (!isTransportError(error)) {
    return undefined;
  }
  const status = statusCodeOf(error);
  if (status === 401) {
    return undefined;
  }
  if (isLostSessionError(error)) {
    return 'the MCP session was lost and could not be re-established';
  }
  if (isClosedClientError(error)) {
    return 'the connection was closed';
  }
  if (status !== undefined) {
    return `the muster endpoint answered HTTP ${status}`;
  }
  const code = connectionFailureCode(error);
  if (messageOf(error) === 'fetch failed' || code) {
    return `the connection failed${code ? ` (${code})` : ''}`;
  }
  return 'the MCP request failed';
}
