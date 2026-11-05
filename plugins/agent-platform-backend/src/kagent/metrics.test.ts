import { Code, ConnectError } from '@connectrpc/connect';
import { kagentCallOutcome } from './metrics';

describe('kagentCallOutcome', () => {
  it.each([
    [new ConnectError('deadline', Code.DeadlineExceeded), 'deadline_exceeded'],
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

  it('names only our own deadline a timeout', () => {
    const deadline = new ConnectError('deadline', Code.DeadlineExceeded);
    expect(kagentCallOutcome(deadline, true)).toBe('timeout');
    expect(kagentCallOutcome(deadline, false)).toBe('deadline_exceeded');
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
