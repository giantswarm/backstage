import { MusterUnauthorizedError } from '../apis/musterUnauthorized';
import { MusterTokenMintError } from '../apis/installationToken';
import {
  isPermanentMusterReadError,
  musterPollingOptions,
} from './musterPolling';

const signInRequired = () =>
  new MusterUnauthorizedError(
    'sign in to model-manager',
    'server_sign_in_required',
    'model-manager',
    'gazelle',
  );

const errored = (error: Error) => ({
  state: { status: 'error', error, data: undefined },
});

describe('isPermanentMusterReadError', () => {
  it("is true for muster's sign-in answer, also kept as a plugin error's cause", () => {
    expect(isPermanentMusterReadError(signInRequired())).toBe(true);
    expect(
      isPermanentMusterReadError(
        new Error('model-manager is not connected', {
          cause: signInRequired(),
        }),
      ),
    ).toBe(true);
  });

  it('is true for a portal session that is gone', () => {
    expect(
      isPermanentMusterReadError(
        new MusterTokenMintError('gazelle', 'session-expired', 'session gone'),
      ),
    ).toBe(true);
  });

  it('is false for a mint that may work next time, and for a muster rollout', () => {
    expect(
      isPermanentMusterReadError(
        new MusterTokenMintError('gazelle', 'mint-failed', 'broker down'),
      ),
    ).toBe(false);
    expect(
      isPermanentMusterReadError(
        Object.assign(new Error('interrupted'), {
          kind: 'interrupted',
          status: 503,
        }),
      ),
    ).toBe(false);
  });
});

describe('musterPollingOptions', () => {
  it('stops after a sign-in answer, polls otherwise, and never from a hidden tab', () => {
    const options = musterPollingOptions(60_000);

    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(true);
    expect(options.refetchInterval(errored(signInRequired()))).toBe(false);
    expect(options.refetchInterval(errored(new Error('timed out')))).toBe(
      60_000,
    );
    expect(
      options.refetchInterval({
        state: { status: 'success', error: null, data: undefined },
      }),
    ).toBe(60_000);
  });

  it("stops on the caller's own permanent errors too", () => {
    const options = musterPollingOptions(60_000, {
      stopOnError: error => (error as Error).name === 'NotFoundError',
    });

    expect(
      options.refetchInterval(
        errored(Object.assign(new Error('gone'), { name: 'NotFoundError' })),
      ),
    ).toBe(false);
  });
});
