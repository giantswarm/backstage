import { LoggerService } from '@backstage/backend-plugin-api';
import { serializeError } from '@backstage/errors';
import express from 'express';
import {
  httpStatusOf,
  isUpstreamError,
  KagentFailure,
  kagentFailureOf,
  upstreamReasonOf,
} from './kagent/errors';

/**
 * What went wrong with a kagent call, in the words of the log line: fixed per
 * cause, since Sentry groups the warnings by their message. The Connect code
 * is one of a handful, so it may name the cause of a failure that is neither a
 * timeout nor an unavailable kagent.
 */
function describeCause(error: Error, failure: KagentFailure): string {
  switch (upstreamReasonOf(error)) {
    case 'timeout':
      return 'timed out';
    case 'unavailable':
      return 'was unavailable';
    default:
      return `failed with ${failure.code}`;
  }
}

/**
 * An Express error handler, mounted last on the agent-platform router: it
 * answers a kagent call's upstream failure with the 500 and the body
 * Backstage's `MiddlewareFactory.error()` would send, and logs it once, at
 * `warn`, as `kagent <call> <cause>`: `kagent SessionService/ListSessions
 * timed out`. Anything else passes on to the middleware.
 *
 * Answered rather than thrown because the middleware logs every 5xx at
 * `error`, and so reports it to Sentry, with the error's message, which names
 * the installation because the person reading it in the browser needs it.
 * Sentry grouped those by route and installation: one degraded kagent opened
 * an issue for every page that read it, on every installation it ran on. The
 * warning keeps the installation in its metadata instead, so there is one
 * issue per call and cause. A degraded kagent still reaches Sentry, once per
 * failed request: see `upstreamError` in `kagent/errors.ts`.
 */
export function kagentErrorHandler(
  logger: LoggerService,
): express.ErrorRequestHandler {
  return (error, req, res, next) => {
    const failure = kagentFailureOf(error);
    if (!failure || !isUpstreamError(error) || res.headersSent) {
      next(error);
      return;
    }
    const statusCode = httpStatusOf(error);
    logger.warn(`kagent ${failure.call} ${describeCause(error, failure)}`, {
      ...failure,
      status: statusCode,
      reason: upstreamReasonOf(error),
    });
    res.status(statusCode).json({
      error: serializeError(error, {
        includeStack: process.env.NODE_ENV === 'development',
      }),
      // Inside the plugin's router `url` is relative to its mount path; the
      // middleware runs at the root, where `url` is the full one again.
      request: { method: req.method, url: req.originalUrl },
      response: { statusCode },
    });
  };
}
