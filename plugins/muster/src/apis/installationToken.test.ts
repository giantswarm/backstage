import {
  isHomeInstallation,
  isMusterTokenMintError,
  isSessionExpiredError,
  MusterTokenMintError,
} from './installationToken';

describe('isHomeInstallation', () => {
  it('is home when the cluster mints through the main provider', () => {
    expect(
      isHomeInstallation({ oidcTokenProvider: 'oidc-gazelle' }, 'oidc-gazelle'),
    ).toBe(true);
  });

  it('is not home when the cluster has its own oidc token provider', () => {
    expect(
      isHomeInstallation({ oidcTokenProvider: 'oidc-golem' }, 'oidc-gazelle'),
    ).toBe(false);
  });

  it('is not home for a cluster without an oidc token provider', () => {
    // e.g. a serviceAccount-authenticated cluster: its token comes from the
    // kubernetes auth providers, not from the main login.
    expect(isHomeInstallation({}, 'oidc-gazelle')).toBe(false);
  });

  it('defaults to home for a cluster the kubernetes API does not know', () => {
    expect(isHomeInstallation(undefined, 'oidc-gazelle')).toBe(true);
  });

  it('defaults to home when no main provider is configured', () => {
    // No gs.authProvider, no broker: there is nothing but the main-token path.
    expect(
      isHomeInstallation({ oidcTokenProvider: 'oidc-golem' }, undefined),
    ).toBe(true);
  });
});

describe('isSessionExpiredError', () => {
  const brokerError = (reason: string) =>
    Object.assign(new Error(`Cluster token request failed: ${reason}`), {
      name: 'ClusterTokenError',
      reason,
    });

  it("recognises the broker's session-expired and subject_invalid reasons", () => {
    expect(isSessionExpiredError(brokerError('session-expired'))).toBe(true);
    expect(isSessionExpiredError(brokerError('subject_invalid'))).toBe(true);
  });

  it('does not mistake other broker failures for an expired session', () => {
    expect(isSessionExpiredError(brokerError('broker_unreachable'))).toBe(
      false,
    );
    expect(isSessionExpiredError(brokerError('exchange_failed'))).toBe(false);
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

describe('MusterTokenMintError', () => {
  it('classifies an expired session and names the installation', () => {
    const error = MusterTokenMintError.fromMintFailure(
      'golem',
      Object.assign(new Error('Cluster token request failed'), {
        name: 'ClusterTokenError',
        reason: 'session-expired',
      }),
    );
    expect(error.reason).toBe('session-expired');
    expect(error.installation).toBe('golem');
    expect(error.message).toMatch(/portal session has expired/);
    expect(error.message).toMatch(/golem/);
    expect(isMusterTokenMintError(error)).toBe(true);
  });

  it('classifies every other failure as mint-failed and quotes the cause', () => {
    const error = MusterTokenMintError.fromMintFailure(
      'golem',
      new Error('Installation "golem" is not known to the Kubernetes API.'),
    );
    expect(error.reason).toBe('mint-failed');
    expect(error.message).toBe(
      'Could not mint a token for muster on golem: Installation "golem" is not known to the Kubernetes API.',
    );
  });

  it('is told apart from other errors by name', () => {
    expect(isMusterTokenMintError(new Error('x'))).toBe(false);
    expect(
      isMusterTokenMintError(
        Object.assign(new Error('x'), { name: 'UnauthorizedError' }),
      ),
    ).toBe(false);
    expect(isMusterTokenMintError(undefined)).toBe(false);
  });
});
