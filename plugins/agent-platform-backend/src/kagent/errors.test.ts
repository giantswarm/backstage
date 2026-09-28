import { mockServices } from '@backstage/backend-test-utils';
import { Code, ConnectError } from '@connectrpc/connect';
import { mapConnectError } from './errors';

const logger = mockServices.logger.mock();
const context = { missingResource: 'gone', endpoint: 'ListAgentInstances' };

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
