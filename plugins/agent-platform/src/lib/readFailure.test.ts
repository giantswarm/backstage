import { describeReadFailure } from './readFailure';

describe('describeReadFailure', () => {
  it.each([
    [{ status: 401 }, 'authentication failed'],
    [{ status: 403 }, 'permission denied'],
    [{ status: 500, reason: 'timeout' }, 'timed out'],
    [{ status: 500, reason: 'unavailable' }, 'unreachable'],
    [{ status: 500, reason: 'server-error' }, 'server error'],
    [{ status: 502 }, 'server error'],
    [{ reason: 'token' }, 'no token for the installation'],
    [{}, 'request failed'],
  ])('%j reads as %s', (fields, reason) => {
    expect(
      describeReadFailure(Object.assign(new Error('x'), fields)).reason,
    ).toBe(reason);
  });

  it('carries the request id', () => {
    expect(
      describeReadFailure(
        Object.assign(new Error('x'), { status: 401, requestId: 'req-1' }),
      ),
    ).toEqual({ reason: 'authentication failed', requestId: 'req-1' });
  });
});
