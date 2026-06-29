/**
 * Whether an error raised by a muster call is an authentication failure (the
 * user has no usable muster session for the target installation). Covers both
 * the backstage-backend signal (`MusterApiClient` tags a 401 response as
 * `UnauthorizedError`) and the case where muster's MCP transport surfaces the
 * 401 inside an otherwise-2xx `/call` body, e.g.
 * `MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): authentication failure: …`.
 */
export function isMusterAuthError(error: unknown): boolean {
  const e = error as { name?: string; message?: string } | null | undefined;
  if (!e) {
    return false;
  }
  if (e.name === 'UnauthorizedError') {
    return true;
  }
  return /\bHTTP 401\b|authentication failure/i.test(e.message ?? '');
}

/** User-facing prompt shown in place of a raw transport error on a 401. */
export const MUSTER_AUTH_PROMPT =
  'This action requires an authenticated muster session for this installation. Connect to muster (sign in) and try again.';

/**
 * Maps an error from a muster mutation (validate/save/run) to a message fit for
 * the UI: a friendly connect prompt for auth failures, the raw message
 * otherwise.
 */
export function mutationErrorMessage(error: unknown): string {
  if (isMusterAuthError(error)) {
    return MUSTER_AUTH_PROMPT;
  }
  return (error as Error)?.message ?? 'The request failed.';
}
