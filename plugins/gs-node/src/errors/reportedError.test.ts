import { NotFoundError, ServiceUnavailableError } from '@backstage/errors';
import {
  ReportedServiceUnavailableError,
  reportedErrorHandler,
} from './reportedError';

class WithReason extends ReportedServiceUnavailableError {
  readonly reason = 'some_reason';
}

describe('reportedErrorHandler', () => {
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

  it('answers a reported error 503 with the error middleware body', () => {
    const { res, status, json } = response();
    const next = jest.fn();

    reportedErrorHandler()(
      new ReportedServiceUnavailableError('gazelle did not answer'),
      req,
      res,
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: {
        name: 'ServiceUnavailableError',
        message: 'gazelle did not answer',
      },
      request: { method: 'GET', url: '/api/muster/tools?installation=gazelle' },
      response: { statusCode: 503 },
    });
  });

  it("carries a subclass's own fields in the answer's error", () => {
    const { res, json } = response();

    reportedErrorHandler()(new WithReason('down'), req, res, jest.fn());

    expect(json.mock.calls[0][0].error).toEqual({
      name: 'ServiceUnavailableError',
      message: 'down',
      reason: 'some_reason',
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

      reportedErrorHandler()(error, req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(status).not.toHaveBeenCalled();
    }
  });

  it('passes the error on once the response has started', () => {
    const { res, status } = response(true);
    const next = jest.fn();
    const error = new ReportedServiceUnavailableError('gazelle did not answer');

    reportedErrorHandler()(error, req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(status).not.toHaveBeenCalled();
  });
});
