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
  'Sign in to Muster for this environment and try again.';

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

/**
 * Whether muster refused a write because the person may not make it: the
 * apiserver's RBAC refusal (`… is forbidden: User "x" cannot update resource
 * "mcpservers" …`, which muster passes on), a `forbidden:` prefix or an HTTP
 * 403. A 401 is a missing session, not this.
 */
export function isForbiddenError(error: unknown): boolean {
  const message = (error as { message?: string } | null | undefined)?.message;
  return /\bis forbidden\b|^forbidden:|\bHTTP 403\b|\bcannot (?:update|patch|create|delete) resource\b/im.test(
    message ?? '',
  );
}

/** Said when the person may not edit a connector, in the page and a save. */
export const NO_EDIT_RIGHTS_MESSAGE =
  "You don't have rights to edit this connector, so nothing was saved. Ask a connector admin: someone who may update MCP servers in Muster's namespace.";

/**
 * A connector save's error for the UI: plainly that the person lacks edit
 * rights when muster refused for that reason, else as `mutationErrorMessage`.
 */
export function connectorSaveErrorMessage(error: unknown): string {
  return isForbiddenError(error)
    ? NO_EDIT_RIGHTS_MESSAGE
    : mutationErrorMessage(error);
}
