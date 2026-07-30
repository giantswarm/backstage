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

  const authUrl = message
    .split('\n')
    .map(line => line.trim())
    .find(line => line.startsWith('https://') || line.startsWith('http://'));

  if (authUrl) {
    return { status: 'auth_required', authUrl, message };
  }

  if (CONNECTED_MARKERS.some(marker => message.includes(marker))) {
    return { status: 'connected', message };
  }

  return { status: 'unknown', message };
}
