import { isClosedClientError } from '@giantswarm/backstage-plugin-gs-node';

/** Muster's core tool that starts a downstream MCP server's OAuth flow. */
export const AUTH_LOGIN_TOOL = 'core_auth_login';

/** Muster's MCP resource carrying per-session, per-server auth status. */
export const AUTH_STATUS_RESOURCE = 'auth://status';

export type AuthLoginStatus =
  /** The session is (now) authenticated to the server; its tools are visible. */
  | 'connected'
  /** The user must complete `authUrl` in a browser to connect the server. */
  | 'auth_required'
  /** Muster refused the login (SSO-managed server, rate limit, no issuer, ...). */
  | 'error'
  /** Muster answered something we don't recognise; re-read auth://status. */
  | 'unknown';

export interface AuthLoginResult {
  status: AuthLoginStatus;
  /** Muster's sign-in URL (its OAuth proxy start endpoint), when challenged. */
  authUrl?: string;
  /** Muster's own message, passed through for display. */
  message: string;
}

/**
 * Markers muster uses to say a session is already/now connected to a server.
 * Kept in sync with `api.AuthMsg*` in the muster repo, which its own CLI
 * matches the same way (see `cmd/auth_helpers.go`
 * `isAlreadyConnectedResponse`).
 */
const CONNECTED_MARKERS = [
  'Already Connected',
  'Successfully connected',
  'already authenticated',
  'does not require authentication',
];

/**
 * Classify `core_auth_login`'s free-text answer. Muster has no structured
 * result for this tool, so we mirror its CLI's detection: an authorization
 * challenge puts the sign-in URL on its own line, and connection outcomes carry
 * one of the `api.AuthMsg*` markers.
 */
export function parseAuthLoginResult(payload: unknown): AuthLoginResult {
  const message =
    typeof payload === 'string' ? payload : JSON.stringify(payload ?? null);

  // Markers first: they are the specific signal, a bare URL line is only the
  // fallback. A connection answer that happens to carry a URL (muster's success
  // text lists the server's capabilities, and could grow an endpoint or docs
  // link) must not be mistaken for a fresh challenge -- that would offer a
  // non-challenge link and poll for a transition that already happened.
  if (CONNECTED_MARKERS.some(marker => message.includes(marker))) {
    return { status: 'connected', message };
  }

  const authUrl = message
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('https://') || line.startsWith('http://'));

  if (authUrl) {
    return { status: 'auth_required', authUrl, message };
  }

  return { status: 'unknown', message };
}

/**
 * Error names that mean a broken dependency rather than a decision by muster:
 *
 * - `MCPClientError` is what `@ai-sdk/mcp` throws for every transport and
 *   protocol fault, including any non-2xx from muster's endpoint (an ingress
 *   5xx, a 401/403 from muster's OAuth proxy, an expired MCP session). It
 *   carries `statusCode`, and its `name` is the documented discriminator --
 *   `isInstance()` is unusable here because it matches any `AISDKError`.
 * - The rest are Backstage classes our own client code throws for a dependency
 *   problem (an installation that isn't configured, a meta-tool with no
 *   executor, a missing resource, a rejected token).
 */
const INFRASTRUCTURE_ERROR_NAMES = [
  'MCPClientError',
  'ServiceUnavailableError',
  'AuthenticationError',
  'NotFoundError',
  'ForbiddenError',
];

/**
 * Whether an error from the muster client is an infrastructure fault rather than
 * muster deliberately declining a tool call. Tool-level refusals arrive as a
 * plain `Error` carrying muster's own message (thrown by
 * MusterMcpClient.unwrapTextContent on `isError`); everything here is a broken
 * dependency, and must keep its 5xx so it reaches Sentry instead of being
 * rendered to the user as a policy decision.
 */
export function isInfrastructureError(error: unknown): boolean {
  if (isClosedClientError(error)) {
    return true;
  }
  // undici surfaces connection failures ('fetch failed', ECONNREFUSED) as a
  // TypeError rather than a named error class.
  if (error instanceof TypeError) {
    return true;
  }
  const candidate = error as
    { name?: string; statusCode?: unknown; code?: unknown } | undefined;
  // Any transport that reports an HTTP status (or a protocol-level code) on the
  // error is describing a broken hop, not a tool result.
  if (
    typeof candidate?.statusCode === 'number' ||
    typeof candidate?.code === 'number'
  ) {
    return true;
  }
  return (
    candidate?.name !== undefined &&
    INFRASTRUCTURE_ERROR_NAMES.includes(candidate.name)
  );
}
