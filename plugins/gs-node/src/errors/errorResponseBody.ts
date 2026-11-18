import { serializeError } from '@backstage/errors';

/** The parts of an Express request the body names. */
export interface ErrorResponseRequest {
  method: string;
  url: string;
  originalUrl?: string;
}

/**
 * The JSON body Backstage's error middleware (`MiddlewareFactory.error()`)
 * sends for an error, for a router that answers the error itself instead of
 * throwing it on: `res.status(statusCode).json(errorResponseBody(...))`.
 *
 * The same body keeps the frontend's `ResponseError` parsing and the
 * `error.message` it shows unchanged, whichever of the two answered. Fields an
 * error class adds (a `reason`, say) travel in `error` beside `name` and
 * `message`; the stack only in development, as the middleware does.
 */
export function errorResponseBody(
  error: Error,
  req: ErrorResponseRequest,
  statusCode: number,
) {
  return {
    error: serializeError(error, {
      includeStack: process.env.NODE_ENV === 'development',
    }),
    // Inside a plugin's router `url` is relative to its mount path; the
    // middleware runs at the root, where `url` is the full one again.
    request: { method: req.method, url: req.originalUrl ?? req.url },
    response: { statusCode },
  };
}
