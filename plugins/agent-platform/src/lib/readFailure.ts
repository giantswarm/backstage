/**
 * Why an installation's read failed, in the words the Sessions page shows.
 *
 * The backend answers a failed read with its status, a `reason` beside the
 * error name (a timeout and a 5xx share the status) and the request id it sent
 * toward kagent in `x-request-id`; {@link KagentApiClient} carries the three
 * on the error it throws. The request id is what ties the banner to the
 * backend's log line and the gateway's.
 */
export type ReadFailure = {
  /** The failure class: authentication, permission, timeout, unreachable, server error. */
  reason: string;
  /** The id the backend sent the failed call with, when it got that far. */
  requestId?: string;
};

/** The fields {@link KagentApiClient} attaches to a failed request's error. */
export type KagentRequestErrorFields = {
  status?: number;
  reason?: string;
  requestId?: string;
};

const REASONS: Record<string, string> = {
  token: 'no token for the environment',
  timeout: 'timed out',
  unavailable: 'temporarily unavailable',
  'server-error': 'server error',
};

/**
 * What the page says when kagent is down for a moment: a write or a send that
 * failed because the controller could not be reached through its gateway.
 */
export const KAGENT_UNAVAILABLE_MESSAGE =
  'The Agent Platform is temporarily unavailable. Try again in a moment.';

/**
 * Whether a failed request is kagent being temporarily unavailable: the
 * backend answered a 5xx with `reason: "unavailable"`, its word for a gRPC
 * `Unavailable` from kagent or its gateway, as when the controller restarts
 * and the gateway's connection to it is refused. Not kagent being absent,
 * which the backend answers with a 404.
 */
export function isKagentUnavailable(error: unknown): boolean {
  const { status, reason } = (error ?? {}) as KagentRequestErrorFields;
  return status !== undefined && status >= 500 && reason === 'unavailable';
}

export function describeReadFailure(error: unknown): ReadFailure {
  const { status, reason, requestId } = (error ??
    {}) as KagentRequestErrorFields;
  return { reason: classify(status, reason), requestId };
}

function classify(status?: number, reason?: string): string {
  if (status === 401) {
    return 'authentication failed';
  }
  if (status === 403) {
    return 'permission denied';
  }
  if (reason && REASONS[reason]) {
    return REASONS[reason];
  }
  if (status !== undefined && status >= 500) {
    return 'server error';
  }
  return 'request failed';
}
