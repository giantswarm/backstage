/**
 * The reason a failed Kubernetes proxy response gives: the `message` of the
 * Kubernetes `Status` object in its body, or of the Backstage error body
 * (`{ error: { message } }`) when the proxy itself failed, otherwise the HTTP
 * status. HTTP/2 responses carry no reason phrase, so `statusText` can be
 * empty and never stands alone.
 */
async function readErrorReason(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.message ?? body?.error?.message;

    if (typeof message === 'string' && message) {
      // The caller appends its own full stop.
      return message.replace(/\.$/, '');
    }
  } catch {
    // Not a JSON error body — fall back to the HTTP status.
  }

  return response.statusText
    ? `HTTP ${response.status} ${response.statusText}`
    : `HTTP ${response.status}`;
}

function errorNameForStatus(status: number): string | undefined {
  switch (status) {
    case 401:
      return 'UnauthorizedError';
    case 403:
      return 'ForbiddenError';
    case 404:
      return 'NotFoundError';
    case 409:
      return 'ConflictError';
    default:
      return undefined;
  }
}

/**
 * An `Error` for a failed Kubernetes proxy request, named so callers can branch
 * on the outcomes that mean something other than "it broke":
 * `UnauthorizedError` (no valid token — retrying won't help),
 * `ForbiddenError` (the user's RBAC says no), `NotFoundError` (nothing there,
 * which an idempotent delete may treat as success) and `ConflictError` (for a
 * create, the name is already taken).
 */
export async function k8sResponseError(
  response: Response,
  description: string,
): Promise<Error> {
  const reason = await readErrorReason(response);
  const error = new Error(`${description}. Reason: ${reason}.`);
  error.name = errorNameForStatus(response.status) ?? error.name;

  return error;
}
