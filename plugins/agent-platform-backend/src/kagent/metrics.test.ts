import { Code, ConnectError } from '@connectrpc/connect';
import { kagentCallOutcome } from './metrics';

describe('kagentCallOutcome', () => {
  it.each([
    [new ConnectError('deadline', Code.DeadlineExceeded), 'timeout'],
    [new ConnectError('503', Code.Unavailable), 'unavailable'],
    [new ConnectError('PING timed out', Code.Unavailable), 'unavailable'],
    [new ConnectError('denied', Code.PermissionDenied), 'permission_denied'],
    [new ConnectError('gone', Code.NotFound), 'not_found'],
    [new ConnectError('boom', Code.Internal), 'internal'],
    [new ConnectError('aborted', Code.Canceled), 'canceled'],
    [new Error('not a Connect error'), 'unknown'],
  ])('%s is %s', (error, outcome) => {
    expect(kagentCallOutcome(error)).toBe(outcome);
  });

  it('names a socket-level failure unreachable, whatever its code', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    expect(
      kagentCallOutcome(
        new ConnectError(
          'refused',
          Code.Unavailable,
          undefined,
          undefined,
          refused,
        ),
      ),
    ).toBe('unreachable');
  });
});
