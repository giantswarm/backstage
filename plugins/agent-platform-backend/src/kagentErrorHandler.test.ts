import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { NotFoundError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import request from 'supertest';
import {
  KagentFailure,
  upstreamError,
  UpstreamReason,
  withKagentFailure,
} from './kagent/errors';
import { kagentErrorHandler } from './kagentErrorHandler';

const FAILURE: KagentFailure = {
  installation: 'gazelle',
  call: 'SessionService/ListSessions',
  code: 'DeadlineExceeded',
  error: 'context deadline exceeded',
  requestId: 'req-1',
};

function timedOut(): Error {
  return withKagentFailure(
    upstreamError(
      "The kagent API for installation 'gazelle' did not respond in time.",
      'timeout',
    ),
    FAILURE,
  );
}

/**
 * A plugin router mounted below `/api/agent-platform` as in the backend, with
 * Backstage's error middleware at the root; `handler` false leaves the kagent
 * handler out, for the body the middleware answers on its own.
 */
function buildApp(error: () => unknown, handler = true) {
  const logger = mockServices.logger.mock();
  // The middleware logs through a child: the same mock, so that what it
  // reports shows here.
  logger.child.mockReturnValue(logger);
  const config = mockServices.rootConfig({ data: {} });
  const router = Router();
  router.get('/kagent/sessions', async () => {
    throw error();
  });
  if (handler) {
    router.use(kagentErrorHandler(logger));
  }
  const app = express();
  app.use('/api/agent-platform', router);
  app.use(MiddlewareFactory.create({ logger, config }).error());
  return { app, logger };
}

const PATH = '/api/agent-platform/kagent/sessions?installation=gazelle';

describe('kagentErrorHandler', () => {
  it('answers a kagent timeout exactly as the error middleware would', async () => {
    const before = await request(buildApp(timedOut, false).app).get(PATH);
    const { app } = buildApp(timedOut);
    const after = await request(app).get(PATH);

    expect(after.status).toBe(500);
    expect(after.body).toEqual(before.body);
    expect(after.body).toMatchObject({
      error: {
        name: 'UpstreamError',
        message:
          "The kagent API for installation 'gazelle' did not respond in time.",
        reason: 'timeout',
      },
      request: { method: 'GET', url: PATH },
      response: { statusCode: 500 },
    });
    // The call behind it stays on the backend.
    expect(JSON.stringify(after.body)).not.toContain('DeadlineExceeded');
  });

  it('logs it once, as a warning grouped by call and cause', async () => {
    const { app, logger } = buildApp(timedOut);
    await request(app).get(PATH);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'kagent SessionService/ListSessions timed out',
      {
        installation: 'gazelle',
        call: 'SessionService/ListSessions',
        status: 500,
        code: 'DeadlineExceeded',
        reason: 'timeout',
        requestId: 'req-1',
        error: 'context deadline exceeded',
      },
    );
    // The error middleware never saw it, so it reported nothing.
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each<[UpstreamReason, string, string]>([
    [
      'unavailable',
      'Unavailable',
      'kagent A2AService/ListTasks was unavailable',
    ],
    [
      'server-error',
      'Internal',
      'kagent A2AService/ListTasks failed with Internal',
    ],
    [
      'server-error',
      'InvalidArgument',
      'kagent A2AService/ListTasks failed with InvalidArgument',
    ],
  ])('names a %s (%s) by its cause', async (reason, code, line) => {
    const { app, logger } = buildApp(() =>
      withKagentFailure(
        upstreamError(
          "The kagent API for installation 'golem' failed.",
          reason,
        ),
        {
          installation: 'golem',
          call: 'A2AService/ListTasks',
          code,
          error: 'boom',
        },
      ),
    );
    const response = await request(app).get(PATH);

    expect(response.status).toBe(500);
    expect(response.body.error.reason).toBe(reason);
    expect(logger.warn).toHaveBeenCalledWith(
      line,
      expect.objectContaining({ installation: 'golem', code }),
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('passes an upstream error without a kagent call on to the middleware', async () => {
    const { app, logger } = buildApp(() =>
      upstreamError('Something upstream failed.'),
    );
    const response = await request(app).get(PATH);

    expect(response.status).toBe(500);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Request failed with status 500',
      expect.anything(),
    );
  });

  it('passes any other error on to the middleware', async () => {
    const { app, logger } = buildApp(
      () => new NotFoundError('That session does not exist.'),
    );
    const response = await request(app).get(PATH);

    expect(response.status).toBe(404);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
