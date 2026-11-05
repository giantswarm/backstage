import { serializeError, ServiceUnavailableError } from '@backstage/errors';

/**
 * The text of the 503 {@link MusterMcpClient} answers when an installation's
 * muster could not be reached, `reason` being one of
 * {@link describeMcpFailure}'s plain words. The person reads it as it is, and
 * the muster plugin's `installationErrorLine` matches on its start, so it names
 * the installation.
 */
function musterUnreachableMessage(
  installation: string,
  reason: string,
): string {
  return `${installation} did not answer: ${reason}`;
}

/**
 * The 503 {@link MusterMcpClient} throws when an installation's muster could
 * not be reached. The client has already logged the failure as a warning, with
 * the installation in the metadata; {@link musterUnreachableErrorHandler}
 * answers it so that Backstage's error middleware does not log it a second
 * time. It is still a `ServiceUnavailableError` by name, so a route without
 * that handler answers it 503 as before.
 */
export class MusterUnreachableError extends ServiceUnavailableError {
  constructor(installation: string, reason: string) {
    super(musterUnreachableMessage(installation, reason));
  }
}

/** The parts of an Express request and response the handler uses. */
interface ErrorHandlerRequest {
  method: string;
  url: string;
  originalUrl?: string;
}
interface ErrorHandlerResponse {
  headersSent: boolean;
  status(code: number): { json(body: unknown): unknown };
}

/**
 * An Express error handler, mounted last on a backend router that calls
 * muster: it answers a {@link MusterUnreachableError} with the 503 and body
 * that Backstage's `MiddlewareFactory.error()` would send, and passes anything
 * else on.
 *
 * Answered rather than thrown because the middleware logs every 5xx at `error`
 * and so reports it to Sentry. `MusterMcpClient` has already warned about the
 * failure with a fixed message, so the middleware's report would be the same
 * failure twice, and one Sentry issue per installation, since the text names
 * it.
 */
export function musterUnreachableErrorHandler() {
  return (
    error: unknown,
    req: ErrorHandlerRequest,
    res: ErrorHandlerResponse,
    next: (error: unknown) => void,
  ): void => {
    if (!(error instanceof MusterUnreachableError) || res.headersSent) {
      next(error);
      return;
    }
    res.status(503).json({
      error: serializeError(error, {
        includeStack: process.env.NODE_ENV === 'development',
      }),
      // Inside a plugin's router `url` is relative to its mount path; the
      // middleware runs at the root, where `url` is the full one again.
      request: { method: req.method, url: req.originalUrl ?? req.url },
      response: { statusCode: 503 },
    });
  };
}
