import { ServiceUnavailableError } from '@backstage/errors';
import { errorResponseBody, ErrorResponseRequest } from './errorResponseBody';

/**
 * The mark of an error whose failure the code that throws it has already
 * logged. A symbol, so it stays out of the answer's body and of the log
 * line's metadata; `Symbol.for`, so that two copies of this package agree.
 */
const REPORTED = Symbol.for('@giantswarm/backstage-plugin-gs-node:reported');

/**
 * Marks `error` as logged already by the code that throws it, at the level its
 * outcome deserves, so that {@link reportedErrorHandler} answers it with its
 * own status and Backstage's error middleware does not log it a second time.
 * For an error that cannot be a {@link ReportedServiceUnavailableError}
 * because it belongs to another class, such as a muster tool error.
 */
export function markReported<T extends Error>(error: T): T {
  Object.defineProperty(error, REPORTED, { value: true, enumerable: false });
  return error;
}

/** Whether {@link markReported} marked `error`. */
export function isReported(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error as unknown as Record<symbol, unknown>)[REPORTED] === true
  );
}

/**
 * A 503 whose failure the code that throws it has already logged, as a
 * warning with a fixed message and the high-cardinality details (the
 * installation, the upstream's own text) in the metadata.
 * {@link reportedErrorHandler} answers it so that Backstage's error middleware
 * does not log it a second time. It is still a `ServiceUnavailableError` by
 * name, so a route without that handler answers it 503 as before.
 *
 * Its message is for the person who reads the answer, and may name the
 * installation. Fields a subclass adds (a `reason`, say) travel in the
 * answer's `error` beside `name` and `message`.
 */
export class ReportedServiceUnavailableError extends ServiceUnavailableError {
  constructor(message?: string, cause?: Error | unknown) {
    super(message, cause);
    markReported(this);
  }
}

/** The parts of an Express response the handler uses. */
interface ErrorHandlerResponse {
  headersSent: boolean;
  status(code: number): { json(body: unknown): unknown };
}

/**
 * The status a reported error is answered with: its own `statusCode` or
 * `status`, as the error middleware reads them, 503 otherwise.
 */
function statusOf(error: Error): number {
  for (const field of ['statusCode', 'status']) {
    const value = (error as unknown as Record<string, unknown>)[field];
    if (
      Number.isInteger(value) &&
      Number(value) >= 100 &&
      Number(value) <= 599
    ) {
      return Number(value);
    }
  }
  return 503;
}

/**
 * An Express error handler, mounted last on a backend router: it answers an
 * error marked as reported ({@link ReportedServiceUnavailableError}, or
 * {@link markReported}) with the status and body that Backstage's
 * `MiddlewareFactory.error()` would send, and passes anything else on.
 *
 * Answered rather than thrown because the middleware logs every 5xx at `error`
 * and so reports it to Sentry. The code that threw the error has already
 * logged the failure with a fixed message, so the middleware's report would be
 * the same failure twice, and one Sentry issue per installation when the text
 * names it.
 */
export function reportedErrorHandler() {
  return (
    error: unknown,
    req: ErrorResponseRequest,
    res: ErrorHandlerResponse,
    next: (error: unknown) => void,
  ): void => {
    if (!isReported(error) || res.headersSent) {
      next(error);
      return;
    }
    const status = statusOf(error);
    res.status(status).json(errorResponseBody(error, req, status));
  };
}
