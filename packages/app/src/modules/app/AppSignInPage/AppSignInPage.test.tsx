import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  gsAuthApiRef,
  gsFallbackSignInAuthApiRef,
} from '@giantswarm/backstage-plugin-gs';
import { screen } from '@testing-library/react';
import { AppSignInPage } from './AppSignInPage';

jest.mock('../../branding/useBranding', () => ({
  useBranding: () => ({
    isLoading: false,
    hasAsset: () => false,
    getAssetUrl: () => undefined,
  }),
}));

jest.mock('@backstage/core-components', () => ({
  ...jest.requireActual('@backstage/core-components'),
  ProxiedSignInPage: ({ provider }: { provider: string }) => (
    <div>proxied sign-in: {provider}</div>
  ),
}));

const authApi = {
  getBackstageIdentity: jest.fn(async () => undefined),
  getProfile: jest.fn(),
  getCredentials: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  sessionState$: jest.fn(),
};

const gs = {
  authProvider: 'oidc-gazelle',
  signInProvider: { title: 'GitHub', message: 'Giant Swarm SSO' },
};

function renderSignIn(
  config: Record<string, unknown>,
  { optIn = false }: { optIn?: boolean } = {},
) {
  return renderInTestApp(<AppSignInPage onSignInSuccess={jest.fn()} />, {
    config: { app: { title: 'Giant Swarm Portal' }, ...config } as any,
    apis: [
      mockApis.featureFlags({
        initialStates: {
          [AGENT_SHELL_FLAG]: optIn
            ? FeatureFlagState.Active
            : FeatureFlagState.None,
        },
      }),
      [gsAuthApiRef, authApi],
      [gsFallbackSignInAuthApiRef, authApi],
    ],
  });
}

describe('AppSignInPage', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.agentShell;
  });

  it('keeps the classic sign-in page on a classic-only deployment', async () => {
    renderSignIn({ gs });

    // Upstream SignInPage: the app title as page header, a card per provider.
    expect(
      await screen.findByRole('heading', { name: 'Giant Swarm Portal' }),
    ).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.getByText('Giant Swarm SSO')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Giant Swarm' }),
    ).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
  });

  it('stays classic for a person who opted into the shell on a classic deployment', async () => {
    renderSignIn({ gs }, { optIn: true });

    expect(
      await screen.findByRole('button', { name: 'Sign In' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Sign in with/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the shell-style sign-in where the deployment serves the Agent Platform', async () => {
    renderSignIn({
      gs: {
        ...gs,
        signInFallbackProvider: {
          connectorId: 'giantswarm-ad',
          title: 'Microsoft',
          message: 'Entra ID account',
        },
      },
      app: { title: 'Giant Swarm Portal', portals: { agentPlatform: true } },
    });

    expect(
      await screen.findByRole('heading', { name: 'Giant Swarm' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in with GitHub' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in with Microsoft' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Giant Swarm Portal' }),
    ).not.toBeInTheDocument();
  });

  it('leaves the default message out of the shell-style sign-in', async () => {
    renderSignIn({
      gs: { authProvider: 'oidc-gazelle' },
      app: { title: 'Giant Swarm Portal', portals: { agentPlatform: true } },
    });
    expect(
      await screen.findByRole('button', { name: 'Sign in with Dex' }),
    ).not.toHaveAccessibleDescription();
    expect(screen.queryByText('Sign in using Dex')).not.toBeInTheDocument();
  });

  it('uses the shell style for an Agent-Platform-only deployment too', async () => {
    renderSignIn({
      gs,
      app: {
        title: 'Giant Swarm Portal',
        portals: { agentPlatform: true, platformPortal: false },
      },
    });

    expect(
      await screen.findByRole('button', { name: 'Sign in with GitHub' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['classic-only', {}],
    ['Agent Platform', { portals: { agentPlatform: true } }],
  ])(
    'signs in as guest through the proxy without gs.authProvider (%s)',
    async (_mode, app) => {
      renderSignIn({ app: { title: 'Giant Swarm Portal', ...app } });

      expect(
        await screen.findByText('proxied sign-in: guest'),
      ).toBeInTheDocument();
    },
  );
});
