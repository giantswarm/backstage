import { mockServices } from '@backstage/backend-test-utils';
import { serializeError } from '@backstage/errors';
import { Code, ConnectError } from '@connectrpc/connect';
import { kagentFailureOf, mapConnectError, rpcName } from './errors';
import { SessionService } from './gen/kagent/api/v1alpha1/sessions_pb';

const logger = mockServices.logger.mock();
const context = {
  call: 'SessionService/ListSessions',
  missingResource: 'gone',
  endpoint: 'ListSessions',
};

function map(error: ConnectError): Error {
  return mapConnectError(error, context, 'gazelle', logger, 1000);
}

describe('mapConnectError', () => {
  describe('a denied request carries the reason the edge or kagent gave', () => {
    it.each([
      [
        'authentication failure: token uses the unknown key "bogus"',
        `Not authenticated against the kagent API for installation 'gazelle': authentication failure: token uses the unknown key "bogus"`,
      ],
      [
        'authentication failure: no bearer token found',
        `Not authenticated against the kagent API for installation 'gazelle': authentication failure: no bearer token found`,
      ],
    ])('401 %s', (reason, message) => {
      const error = map(new ConnectError(reason, Code.Unauthenticated));
      expect(error).toMatchObject({ name: 'AuthenticationError', message });
    });

    it('403', () => {
      const error = map(
        new ConnectError(
          'not allowed to list all creators',
          Code.PermissionDenied,
        ),
      );
      expect(error).toMatchObject({
        name: 'NotAllowedError',
        message: `Not authorized to use the kagent API for installation 'gazelle': not allowed to list all creators`,
      });
    });
  });

  describe('a denial without a reason keeps the plain message', () => {
    it.each(['', '   ', 'HTTP 401'])('401 %j', reason => {
      const error = map(new ConnectError(reason, Code.Unauthenticated));
      expect(error.message).toBe(
        `Not authenticated against the kagent API for installation 'gazelle'.`,
      );
    });

    it('403 HTTP 403', () => {
      const error = map(new ConnectError('HTTP 403', Code.PermissionDenied));
      expect(error.message).toBe(
        `Not authorized to use the kagent API for installation 'gazelle'.`,
      );
    });
  });

  it('bounds a long reason and logs it whole at debug', () => {
    const reason = 'x'.repeat(1000);
    const error = map(new ConnectError(reason, Code.Unauthenticated));
    expect(error.message).toBe(
      `Not authenticated against the kagent API for installation 'gazelle': ${'x'.repeat(300)}…`,
    );
    expect(logger.debug).toHaveBeenCalledWith(
      `kagent API denied a request for installation 'gazelle'`,
      { code: 'Unauthenticated', error: reason },
    );
  });
});

describe('the reason an upstream failure carries', () => {
  it.each([
    [Code.DeadlineExceeded, 'timeout'],
    [Code.Unavailable, 'unavailable'],
    [Code.Internal, 'server-error'],
  ])('%s is %s', (code, reason) => {
    expect(map(new ConnectError('boom', code))).toMatchObject({
      name: 'UpstreamError',
      reason,
    });
  });
});

describe('the failure an upstream error carries', () => {
  it('names the call, the code, the message and the request id', () => {
    const error = mapConnectError(
      new ConnectError('context deadline exceeded', Code.DeadlineExceeded),
      { ...context, requestId: 'req-7' },
      'gazelle',
      logger,
      1000,
    );
    expect(error.name).toBe('UpstreamError');
    expect(kagentFailureOf(error)).toEqual({
      installation: 'gazelle',
      call: 'SessionService/ListSessions',
      code: 'DeadlineExceeded',
      error: 'context deadline exceeded',
      requestId: 'req-7',
    });
  });

  it('is left out of what the browser gets', () => {
    const error = map(new ConnectError('boom', Code.Internal));
    expect(kagentFailureOf(error)).toBeDefined();
    // What Backstage's error serializer sends: the code and the call stay out.
    const sent = JSON.stringify(serializeError(error));
    expect(sent).toContain('"reason":"server-error"');
    expect(sent).not.toContain('Internal');
    expect(sent).not.toContain('SessionService');
  });

  it('is not attached to a decision', () => {
    const error = map(new ConnectError('gone', Code.NotFound));
    expect(error.name).toBe('NotFoundError');
    expect(kagentFailureOf(error)).toBeUndefined();
  });
});

describe('rpcName', () => {
  it('reads Service/Method off the descriptor', () => {
    expect(rpcName(SessionService.method.listSessions)).toBe(
      'SessionService/ListSessions',
    );
  });
});
