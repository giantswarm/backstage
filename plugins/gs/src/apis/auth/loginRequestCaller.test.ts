import {
  asLoginRequestCaller,
  asLoginRequestCallerApi,
  LOGIN_REQUESTED_BY_ATTRIBUTE,
} from './loginRequestCaller';

function requestedBy() {
  return document.body.getAttribute(LOGIN_REQUESTED_BY_ATTRIBUTE);
}

/** A call to the main sign-in that settles when the test says so. */
function pendingSignIn() {
  let settle: (ok: boolean) => void = () => {};
  const done = new Promise<string>((resolve, reject) => {
    settle = ok => (ok ? resolve('token') : reject(new Error('declined')));
  });
  return { request: () => done, settle };
}

describe('asLoginRequestCaller', () => {
  it('names the caller while its call to the main sign-in waits', async () => {
    const signIn = pendingSignIn();

    const call = asLoginRequestCaller('cluster-token-mint', signIn.request);
    expect(requestedBy()).toBe('cluster-token-mint');

    signIn.settle(true);
    await expect(call).resolves.toBe('token');
    expect(requestedBy()).toBeNull();
  });

  it('clears the name when the person declines the sign-in', async () => {
    const signIn = pendingSignIn();

    const call = asLoginRequestCaller('portal-fetch', signIn.request);
    signIn.settle(false);

    await expect(call).rejects.toThrow('declined');
    expect(requestedBy()).toBeNull();
  });

  it('names every caller that waits, each until its last call settles', async () => {
    const fetchOne = pendingSignIn();
    const fetchTwo = pendingSignIn();
    const mint = pendingSignIn();

    const calls = [
      asLoginRequestCaller('portal-fetch', fetchOne.request),
      asLoginRequestCaller('cluster-token-mint', mint.request),
      asLoginRequestCaller('portal-fetch', fetchTwo.request),
    ];
    expect(requestedBy()).toBe('cluster-token-mint portal-fetch');

    mint.settle(true);
    await calls[1];
    expect(requestedBy()).toBe('portal-fetch');

    fetchOne.settle(true);
    await calls[0];
    expect(requestedBy()).toBe('portal-fetch');

    fetchTwo.settle(true);
    await calls[2];
    expect(requestedBy()).toBeNull();
  });
});

describe('asLoginRequestCallerApi', () => {
  /** An auth API whose getters record the callers named while they run. */
  function authApi() {
    const seen: (string | null)[] = [];
    const record = async (..._args: unknown[]) => {
      seen.push(requestedBy());
      return 'token';
    };
    return {
      seen,
      api: {
        getIdToken: jest.fn(record),
        getAccessToken: jest.fn(record),
        getBackstageIdentity: jest.fn(record),
        signOut: jest.fn(async () => requestedBy()),
      },
    };
  }

  it('names the caller while an interactive getter waits', async () => {
    const { api, seen } = authApi();
    const labelled = asLoginRequestCallerApi('plans', api);

    await labelled.getIdToken();
    await labelled.getAccessToken('repo');
    await labelled.getBackstageIdentity({ optional: false });

    expect(seen).toEqual(['plans', 'plans', 'plans']);
    expect(requestedBy()).toBeNull();
    expect(api.getAccessToken).toHaveBeenCalledWith('repo');
  });

  it('leaves an optional call unnamed: it never opens the sign-in', async () => {
    const { api, seen } = authApi();
    const labelled = asLoginRequestCallerApi('plans', api);

    await labelled.getIdToken({ optional: true });
    await labelled.getAccessToken('repo', { optional: true });

    expect(seen).toEqual([null, null]);
  });

  it('passes every other member through', async () => {
    const { api } = authApi();
    await expect(
      asLoginRequestCallerApi('plans', api).signOut(),
    ).resolves.toBeNull();
    expect(api.signOut).toHaveBeenCalledTimes(1);
  });
});
