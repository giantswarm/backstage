import { SessionState } from '@backstage/core-plugin-api';
import ObservableImpl from 'zen-observable';
import { LastingIdTokens } from './LastingIdTokens';

const MINUTE = 60_000;
const T0 = new Date('2026-10-19T06:30:00Z').getTime();
const TURN = 25 / 30;

/** A 30-minute ID token issued at `issuedAt`, named so tests can tell. */
function idToken(name: string, issuedAt: number): string {
  const b64url = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  const iat = Math.floor(issuedAt / 1000);
  return `${b64url({ alg: 'RS256' })}.${b64url({
    name,
    iat,
    exp: iat + 30 * 60,
  })}.signature`;
}

function minutesLeft(token: string): number {
  const exp = JSON.parse(atob(token.split('.')[1])).exp as number;
  return (exp * 1000 - Date.now()) / MINUTE;
}

function setup(initialSessionToken: string) {
  let sessionToken = initialSessionToken;
  let emitState: (state: SessionState) => void = () => {};
  const authApi = {
    getIdToken: jest.fn(async () => sessionToken),
    sessionState$: () =>
      new ObservableImpl<SessionState>(observer => {
        emitState = state => observer.next(state);
      }),
  };
  let refreshes = 0;
  const refresh = jest.fn(async () =>
    idToken(`refreshed-${++refreshes}`, Date.now()),
  );
  const tokens = new LastingIdTokens({ authApi, refresh });
  return {
    tokens,
    authApi,
    refresh,
    setSessionToken: (token: string) => {
      sessionToken = token;
    },
    emitState: (state: SessionState) => emitState(state),
  };
}

describe('LastingIdTokens', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: T0 });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("answers with the session's token while it has the share left", async () => {
    const session = idToken('session', T0);
    const { tokens, refresh } = setup(session);
    jest.setSystemTime(T0 + 4 * MINUTE);

    await expect(tokens.getIdToken(TURN)).resolves.toBe(session);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('refreshes first when less is left, and answers with a token that has it', async () => {
    // The session's token has 24 of its 30 minutes left: Backstage keeps it
    // for another 21.
    const { tokens, refresh } = setup(idToken('session', T0));
    jest.setSystemTime(T0 + 6 * MINUTE);

    const token = await tokens.getIdToken(TURN);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(TURN);
    expect(minutesLeft(token)).toBeGreaterThanOrEqual(25);
  });

  it('keeps the refreshed token for the next request while it lasts', async () => {
    const { tokens, refresh } = setup(idToken('session', T0));
    jest.setSystemTime(T0 + 6 * MINUTE);
    const first = await tokens.getIdToken(TURN);

    jest.setSystemTime(T0 + 9 * MINUTE);
    await expect(tokens.getIdToken(TURN)).resolves.toBe(first);
    expect(refresh).toHaveBeenCalledTimes(1);

    // Past its own 25 minutes, it is refreshed again.
    jest.setSystemTime(T0 + 12 * MINUTE);
    const third = await tokens.getIdToken(TURN);
    expect(third).not.toBe(first);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(minutesLeft(third)).toBeGreaterThanOrEqual(25);
  });

  it('shares one refresh between requests made while it runs', async () => {
    const { tokens, refresh } = setup(idToken('session', T0));
    jest.setSystemTime(T0 + 6 * MINUTE);

    const [a, b] = await Promise.all([
      tokens.getIdToken(TURN),
      tokens.getIdToken(TURN),
    ]);

    expect(a).toBe(b);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("answers with the session's token when the refresh fails", async () => {
    const session = idToken('session', T0);
    const { tokens, refresh } = setup(session);
    refresh.mockRejectedValueOnce(new Error('Auth refresh request failed'));
    jest.setSystemTime(T0 + 20 * MINUTE);

    await expect(tokens.getIdToken(TURN)).resolves.toBe(session);
  });

  it('answers with the longer of the two when the refresh comes back no better', async () => {
    const session = idToken('session', T0);
    const { tokens, refresh } = setup(session);
    refresh.mockResolvedValueOnce(idToken('older', T0 - 5 * MINUTE));
    jest.setSystemTime(T0 + 20 * MINUTE);

    await expect(tokens.getIdToken(TURN)).resolves.toBe(session);
  });

  it('asks the session with the request as given, and never refreshes without one', async () => {
    const { tokens, authApi, refresh } = setup('');
    jest.setSystemTime(T0 + 20 * MINUTE);

    await expect(tokens.getIdToken(TURN, { optional: true })).resolves.toBe('');
    expect(authApi.getIdToken).toHaveBeenCalledWith({ optional: true });
    expect(refresh).not.toHaveBeenCalled();
  });

  it('drops a refresh that was still running at sign-out', async () => {
    const session = idToken('session', T0);
    const { tokens, refresh, emitState } = setup(session);
    jest.setSystemTime(T0 + 6 * MINUTE);
    let finish: (token: string) => void = () => {};
    refresh.mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          finish = resolve;
        }),
    );

    const pending = tokens.getIdToken(TURN);
    await Promise.resolve();
    emitState(SessionState.SignedOut);
    finish(idToken('signed-out', Date.now()));

    // The request made before the sign-out gets its own session's token; the
    // refreshed one is neither handed out nor kept.
    await expect(pending).resolves.toBe(session);
    await tokens.getIdToken(TURN);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not keep a refreshed token whose lifetime cannot be read', async () => {
    const { tokens, refresh } = setup(idToken('session', T0));
    refresh.mockResolvedValueOnce('opaque-token');
    jest.setSystemTime(T0 + 6 * MINUTE);

    await expect(tokens.getIdToken(TURN)).resolves.toBe('opaque-token');
    // The next request refreshes again rather than serve it forever.
    const next = await tokens.getIdToken(TURN);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(minutesLeft(next)).toBeGreaterThanOrEqual(25);
  });

  it('forgets the refreshed token on sign-out', async () => {
    const { tokens, refresh, setSessionToken, emitState } = setup(
      idToken('session', T0),
    );
    jest.setSystemTime(T0 + 6 * MINUTE);
    const kept = await tokens.getIdToken(TURN);

    emitState(SessionState.SignedOut);
    // The next person's session token, signed in an hour before and only
    // refreshed by Backstage's 3-minute rule.
    setSessionToken(idToken('next-session', T0 - 4 * MINUTE));
    const token = await tokens.getIdToken(TURN);

    expect(token).not.toBe(kept);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
