import {
  MusterTokenMintError,
  MusterUnauthorizedError,
} from '@giantswarm/backstage-plugin-muster';

import { toolchainCheckFailureOf } from './useToolchainManager';

describe('toolchainCheckFailureOf', () => {
  it('tells a refused token, a signed-out person and a muster that did not answer apart', () => {
    expect(
      toolchainCheckFailureOf(
        new MusterUnauthorizedError('refused', 'token_rejected'),
      ),
    ).toBe('tokenRejected');
    expect(
      toolchainCheckFailureOf(
        new MusterTokenMintError('meadow', 'session-expired', 'gone'),
      ),
    ).toBe('signedOut');
    expect(
      toolchainCheckFailureOf(
        Object.assign(new Error('meadow did not answer'), { status: 503 }),
      ),
    ).toBe('notAnswering');
    // No read failed with a reason: an unreachable muster, never asked.
    expect(toolchainCheckFailureOf(undefined)).toBe('notAnswering');
  });
});
