import type { SentryEvent } from './normalizeSentryEvent';

/**
 * The message @backstage/backend-defaults' lifecycle middleware answers with
 * (a 503 `ServiceUnavailableError`) while the backend is still starting up.
 * Callers retry and the request succeeds seconds later.
 */
const NOT_STARTED = 'Service has not started up yet';

/**
 * The errorHandler middleware logs the lifecycle middleware's 503 at `error`
 * as `Request failed with status 503 <message>`. Used in `ignoreErrors`.
 */
export const STARTUP_REQUEST_FAILURE = new RegExp(
  `^Request failed with status 503 ${NOT_STARTED}$`,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Whether the event is @backstage/plugin-events-node's poll loop reporting
 * that the events backend was still starting up. The loop logs every failure
 * as `Poll failed for subscription "…", retrying in …ms` with the
 * `ResponseError` as metadata; the remote error arrives as `extra.cause`.
 * A poll failure with any other cause, a 503 from somewhere else included,
 * still reaches Sentry.
 */
export function isStartupPollFailure(event: SentryEvent): boolean {
  const message = typeof event.message === 'string' ? event.message : undefined;
  if (!message?.startsWith('Poll failed for subscription ')) {
    return false;
  }
  const cause = event.extra?.cause;
  return (
    isRecord(cause) &&
    cause.name === 'ServiceUnavailableError' &&
    cause.message === NOT_STARTED
  );
}
