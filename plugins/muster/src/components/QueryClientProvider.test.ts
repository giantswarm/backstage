import { MusterUnauthorizedError } from '../apis/musterUnauthorized';
import { MusterTokenMintError } from '../apis/installationToken';
import { shouldRetryMusterQuery } from './QueryClientProvider';

describe('shouldRetryMusterQuery', () => {
  it('never retries a 401 or a token that could not be had', () => {
    expect(
      shouldRetryMusterQuery(
        0,
        new MusterUnauthorizedError('sign in', 'server_sign_in_required', 'x'),
      ),
    ).toBe(false);
    expect(
      shouldRetryMusterQuery(
        0,
        new Error('wrapped', {
          cause: new MusterUnauthorizedError('rejected', 'token_rejected'),
        }),
      ),
    ).toBe(false);
    expect(
      shouldRetryMusterQuery(
        0,
        new MusterTokenMintError('gazelle', 'session-expired', 'expired'),
      ),
    ).toBe(false);
  });

  it('retries a token mint that failed for another reason than a gone session', () => {
    expect(
      shouldRetryMusterQuery(
        0,
        new MusterTokenMintError('golem', 'mint-failed', 'broker unreachable'),
      ),
    ).toBe(true);
  });

  it('retries a call a rollout of muster interrupted, but not another 503', () => {
    const unavailable = (kind?: string) =>
      Object.assign(new Error('x'), {
        name: 'ServiceUnavailableError',
        status: 503,
        kind,
      });
    expect(shouldRetryMusterQuery(0, unavailable('interrupted'))).toBe(true);
    expect(shouldRetryMusterQuery(3, unavailable('interrupted'))).toBe(false);
    expect(shouldRetryMusterQuery(0, unavailable('client_not_connected'))).toBe(
      false,
    );
    expect(shouldRetryMusterQuery(0, unavailable())).toBe(false);
  });

  it.each([400, 409, 422])(
    'never retries a tool refusal answered %i',
    status => {
      const refusal = Object.assign(new Error('conflict: x'), {
        status,
        kind: 'conflict',
      });
      expect(shouldRetryMusterQuery(0, refusal)).toBe(false);
    },
  );

  it('retries a tool error muster failed with, a 504 or a 502', () => {
    for (const [status, kind] of [
      [504, 'timeout'],
      [502, 'tool_not_found'],
    ] as const) {
      expect(
        shouldRetryMusterQuery(
          0,
          Object.assign(new Error('x'), { status, kind }),
        ),
      ).toBe(true);
    }
  });

  it('retries any other failure up to three times', () => {
    expect(shouldRetryMusterQuery(2, new Error('connection reset'))).toBe(true);
    expect(shouldRetryMusterQuery(3, new Error('connection reset'))).toBe(
      false,
    );
  });
});
