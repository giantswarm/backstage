import { ClusterTokenError } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  isHomeInstallation,
  isMusterTokenMintError,
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

describe('MusterTokenMintError', () => {
  it('classifies an expired session and names the installation', () => {
    const error = MusterTokenMintError.fromMintFailure(
      'golem',
      new ClusterTokenError('golem', 'session-expired'),
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
