import { NotFoundError, ServiceUnavailableError } from '@backstage/errors';
import {
  MusterUnreachableError,
  musterUnreachableErrorHandler,
} from './musterUnreachable';

describe('musterUnreachableErrorHandler', () => {
  function response(headersSent = false) {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    return { res: { headersSent, status }, status, json };
  }
  // Inside the plugin's router: `url` lost the mount path, `originalUrl` has it.
  const req = {
    method: 'GET',
    url: '/tools?installation=gazelle',
    originalUrl: '/api/muster/tools?installation=gazelle',
  };

  it('answers an unreachable installation 503 with the error middleware body', () => {
    const { res, status, json } = response();
    const next = jest.fn();

    musterUnreachableErrorHandler()(
      new MusterUnreachableError('gazelle', 'the connection was closed'),
      req,
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: {
        name: 'ServiceUnavailableError',
        message: 'gazelle did not answer: the connection was closed',
      },
      request: { method: 'GET', url: '/api/muster/tools?installation=gazelle' },
      response: { statusCode: 503 },
    });
  });

  it('passes any other error on, a plain 503 included', () => {
    for (const error of [
      new ServiceUnavailableError('Muster meta-tool x has no executor'),
      new NotFoundError('nope'),
      new Error('boom'),
    ]) {
      const { res, status } = response();
      const next = jest.fn();

      musterUnreachableErrorHandler()(error, req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(status).not.toHaveBeenCalled();
    }
  });

  it('passes the error on once the response has started', () => {
    const { res, status } = response(true);
    const next = jest.fn();
    const error = new MusterUnreachableError(
      'gazelle',
      'the MCP request failed',
    );

    musterUnreachableErrorHandler()(error, req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(status).not.toHaveBeenCalled();
  });

  it('is a ServiceUnavailableError by name, so a route without the handler still answers 503', () => {
    const error = new MusterUnreachableError(
      'gazelle',
      'the MCP request failed',
    );

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error.name).toBe('ServiceUnavailableError');
  });
});
