import {
  ClusterTokenError,
  isSessionExpiredError,
  isSignInDeclinedError,
} from './clusterTokenError';

describe('isSessionExpiredError', () => {
  it("recognises the broker's session-expired and subject_invalid reasons", () => {
    expect(
      isSessionExpiredError(new ClusterTokenError('golem', 'session-expired')),
    ).toBe(true);
    expect(
      isSessionExpiredError(new ClusterTokenError('golem', 'subject_invalid')),
    ).toBe(true);
  });

  it('does not mistake other broker failures for an expired session', () => {
    expect(
      isSessionExpiredError(
        new ClusterTokenError('golem', 'broker_unreachable'),
      ),
    ).toBe(false);
    expect(
      isSessionExpiredError(new ClusterTokenError('golem', 'exchange_failed')),
    ).toBe(false);
  });

  it('recognises the wording of a declined re-login', () => {
    expect(
      isSessionExpiredError(
        new Error('Main session expired and re-login did not complete'),
      ),
    ).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isSessionExpiredError(new Error('ENOTFOUND'))).toBe(false);
    expect(isSessionExpiredError(undefined)).toBe(false);
    expect(isSessionExpiredError(null)).toBe(false);
  });
});

describe('isSignInDeclinedError', () => {
  it('recognises a declined Login Required prompt', () => {
    const rejected = Object.assign(
      new Error('Login failed, rejected by user'),
      {
        name: 'RejectedError',
      },
    );
    expect(isSignInDeclinedError(rejected)).toBe(true);
  });

  it('recognises a closed sign-in popup', () => {
    expect(
      isSignInDeclinedError(new Error('Login failed, popup was closed')),
    ).toBe(true);
  });

  it('is false for an expired session and anything else', () => {
    expect(
      isSignInDeclinedError(new ClusterTokenError('golem', 'session-expired')),
    ).toBe(false);
    expect(isSignInDeclinedError(new Error('ENOTFOUND'))).toBe(false);
    expect(isSignInDeclinedError(undefined)).toBe(false);
  });
});
