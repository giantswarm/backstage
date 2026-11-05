import { describeReadFailure, isKagentUnavailable } from './readFailure';

describe('describeReadFailure', () => {
  it.each([
    [{ status: 401 }, 'authentication failed'],
    [{ status: 403 }, 'permission denied'],
    [{ status: 500, reason: 'timeout' }, 'timed out'],
    [{ status: 500, reason: 'unavailable' }, 'temporarily unavailable'],
    [{ status: 500, reason: 'server-error' }, 'server error'],
    [{ status: 502 }, 'server error'],
    [{ reason: 'token' }, 'no token for the environment'],
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

describe('isKagentUnavailable', () => {
  it.each([
    [{ status: 500, reason: 'unavailable' }, true],
    [{ status: 500, reason: 'timeout' }, false],
    [{ status: 500, reason: 'server-error' }, false],
    [{ status: 502 }, false],
    // kagent absent is a 404, never "temporarily unavailable".
    [{ status: 404, reason: 'unavailable' }, false],
    [{}, false],
  ])('%j is %s', (fields, expected) => {
    expect(isKagentUnavailable(Object.assign(new Error('x'), fields))).toBe(
      expected,
    );
  });

  it('is false for no error at all', () => {
    expect(isKagentUnavailable(undefined)).toBe(false);
  });
});
