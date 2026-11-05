import { ServiceUnavailableError } from '@backstage/errors';
import { errorResponseBody, ErrorResponseRequest } from './errorResponseBody';

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
export class ReportedServiceUnavailableError extends ServiceUnavailableError {}

/** The parts of an Express response the handler uses. */
interface ErrorHandlerResponse {
  headersSent: boolean;
  status(code: number): { json(body: unknown): unknown };
}

/**
 * An Express error handler, mounted last on a backend router: it answers a
 * {@link ReportedServiceUnavailableError} with the 503 and body that
 * Backstage's `MiddlewareFactory.error()` would send, and passes anything else
 * on.
 *
 * Answered rather than thrown because the middleware logs every 5xx at `error`
 * and so reports it to Sentry. The code that threw the error has already
 * warned about the failure with a fixed message, so the middleware's report
 * would be the same failure twice, and one Sentry issue per installation when
 * the text names it.
 */
export function reportedErrorHandler() {
  return (
    error: unknown,
    req: ErrorResponseRequest,
    res: ErrorHandlerResponse,
    next: (error: unknown) => void,
  ): void => {
    if (
      !(error instanceof ReportedServiceUnavailableError) ||
      res.headersSent
    ) {
      next(error);
      return;
    }
    res.status(503).json(errorResponseBody(error, req, 503));
  };
}
