async function readBody(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    // Not a JSON error body — callers fall back to the HTTP status.
    return undefined;
  }
}

function bodyMessage(body: any): string | undefined {
  for (const message of [body?.message, body?.error?.message]) {
    if (typeof message === 'string' && message) {
      // The caller appends its own full stop.
      return message.replace(/\.$/, '');
    }
  }

  return undefined;
}

function reasonOf(
  response: Response,
  body: any,
  options: { withStatus?: boolean },
): string {
  const status = response.statusText
    ? `HTTP ${response.status} ${response.statusText}`
    : `HTTP ${response.status}`;
  const message = bodyMessage(body);

  if (!message) {
    return status;
  }

  return options.withStatus ? `${status}: ${message}` : message;
}

/**
 * The reason a failed Kubernetes proxy response gives: the `message` of the
 * Kubernetes `Status` object in its body, or of the Backstage error body
 * (`{ error: { message } }`) when the proxy itself failed, otherwise the HTTP
 * status. HTTP/2 responses carry no reason phrase, so `statusText` can be
 * empty and never stands alone.
 *
 * `withStatus` puts the HTTP status in front of a body message too
 * (`HTTP 401: Unauthorized`), for callers whose copy relies on the status —
 * an apiserver's 401 message says nothing else.
 */
export async function k8sResponseReason(
  response: Response,
  options: { withStatus?: boolean } = {},
): Promise<string> {
  return reasonOf(response, await readBody(response), options);
}

/**
 * The error name for a failed Kubernetes proxy response's status, or
 * `undefined` for a status that means nothing more specific than "it broke".
 * The plugins' QueryClientProviders decline to retry these names.
 */
export function k8sErrorNameForStatus(status: number): string | undefined {
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
 * A failed Kubernetes proxy request's `Error`. `notFoundName` is the object a
 * 404's `Status` names: the apiserver serves the API but has no such object.
 * A 404 for an API path it does not serve names no object.
 */
export type K8sResponseError = Error & { notFoundName?: string };

/**
 * An `Error` for a failed Kubernetes proxy request, named so callers can branch
 * on the outcomes that mean something other than "it broke":
 * `UnauthorizedError` (no valid token — retrying won't help),
 * `ForbiddenError` (the user's RBAC says no), `NotFoundError` (nothing there,
 * which an idempotent delete may treat as success) and `ConflictError` (for a
 * create, the name is already taken).
 *
 * Use it for every request through `kubernetesApi.proxy`, so a failure reads
 * and is named the same wherever it happened.
 */
export async function k8sResponseError(
  response: Response,
  description: string,
): Promise<K8sResponseError> {
  const body = await readBody(response);
  const reason = reasonOf(response, body, {});
  const error: K8sResponseError = new Error(
    `${description}. Reason: ${reason}.`,
  );
  error.name = k8sErrorNameForStatus(response.status) ?? error.name;

  const notFoundName = body?.details?.name;
  if (response.status === 404 && typeof notFoundName === 'string') {
    error.notFoundName = notFoundName;
  }

  return error;
}
