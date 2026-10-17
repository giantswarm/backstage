import {
  asLoginRequestCaller,
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
