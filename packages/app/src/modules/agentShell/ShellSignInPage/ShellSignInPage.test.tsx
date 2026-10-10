import { createApiRef } from '@backstage/core-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShellSignInPage } from './ShellSignInPage';
import { PROVIDER_STORAGE_KEY } from './useProviderSignIn';

jest.mock('../../nav/LogoIcon', () => ({
  LogoIcon: () => <span data-testid="logo" />,
}));

const identity = {
  type: 'user' as const,
  userEntityRef: 'user:default/jane',
  ownershipEntityRefs: ['user:default/jane'],
};

function mockAuthApi() {
  return {
    getBackstageIdentity: jest.fn(async () => ({
      id: 'jane',
      token: 'token',
      identity,
    })),
    getProfile: jest.fn(async () => ({ email: 'jane@example.com' })),
    getCredentials: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(async () => {}),
    sessionState$: jest.fn(),
  };
}

const mainRef = createApiRef<any>({ id: 'test.auth.main' });
const fallbackRef = createApiRef<any>({ id: 'test.auth.fallback' });

const providers = [
  {
    id: 'dex-auth-provider',
    title: 'GitHub',
    message: 'Giant Swarm SSO',
    apiRef: mainRef,
  },
  {
    id: 'dex-fallback-auth-provider',
    title: 'Microsoft',
    message: 'Entra ID account',
    apiRef: fallbackRef,
  },
];

function renderPage({
  path = '/',
  main = mockAuthApi(),
  fallback = mockAuthApi(),
  onSignInSuccess = jest.fn(),
  analytics = mockApis.analytics(),
  only,
}: {
  path?: string;
  main?: ReturnType<typeof mockAuthApi>;
  fallback?: ReturnType<typeof mockAuthApi>;
  onSignInSuccess?: jest.Mock;
  analytics?: ReturnType<typeof mockApis.analytics>;
  only?: number;
} = {}) {
  const result = renderInTestApp(
    <ShellSignInPage
      onSignInSuccess={onSignInSuccess}
      providers={only === undefined ? providers : [providers[only]]}
    />,
    {
      initialRouteEntries: [path],
      config: { app: { portals: { agentPlatform: true } } },
      apis: [analytics, [mainRef, main], [fallbackRef, fallback]],
    },
  );
  return { result, main, fallback, onSignInSuccess, analytics };
}

describe('ShellSignInPage', () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.agentShell;
  });

  it('shows one card with a button and message per sign-in option', async () => {
    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Agent Platform' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sign in to continue.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Sign in with GitHub' }),
    ).toHaveAccessibleDescription('Giant Swarm SSO');
    expect(
      screen.getByRole('button', { name: 'Sign in with Microsoft' }),
    ).toHaveAccessibleDescription('Entra ID account');
  });

  it('offers a single option alone', async () => {
    renderPage({ only: 0 });

    expect(
      await screen.findByRole('button', { name: 'Sign in with GitHub' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Microsoft/ }),
    ).not.toBeInTheDocument();
  });

  it('signs in through the chosen provider’s popup and remembers it', async () => {
    const { fallback, main, onSignInSuccess, analytics } = renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in with Microsoft' }),
    );

    await waitFor(() => expect(onSignInSuccess).toHaveBeenCalledTimes(1));
    expect(fallback.getBackstageIdentity).toHaveBeenCalledWith({
      instantPopup: true,
    });
    expect(main.getBackstageIdentity).not.toHaveBeenCalled();
    expect(localStorage.getItem(PROVIDER_STORAGE_KEY)).toBe(
      'dex-fallback-auth-provider',
    );
    const signedIn = onSignInSuccess.mock.calls[0][0];
    await expect(signedIn.getBackstageIdentity()).resolves.toEqual(identity);
    expect(
      analytics.getEvents().filter(event => event.action === 'signIn'),
    ).toEqual([expect.objectContaining({ subject: 'success' })]);
  });

  it('forgets the remembered provider on sign-out', async () => {
    const { main, onSignInSuccess } = renderPage();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in with GitHub' }),
    );
    await waitFor(() => expect(onSignInSuccess).toHaveBeenCalled());

    await onSignInSuccess.mock.calls[0][0].signOut();

    expect(main.signOut).toHaveBeenCalled();
    expect(localStorage.getItem(PROVIDER_STORAGE_KEY)).toBeNull();
  });

  it('picks up the remembered provider’s session silently', async () => {
    localStorage.setItem(PROVIDER_STORAGE_KEY, 'dex-fallback-auth-provider');
    const { fallback, main, onSignInSuccess } = renderPage();

    await waitFor(() => expect(onSignInSuccess).toHaveBeenCalledTimes(1));
    expect(fallback.getBackstageIdentity).toHaveBeenCalledWith({
      optional: true,
    });
    expect(main.getBackstageIdentity).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: /Sign in with/ }),
    ).not.toBeInTheDocument();
  });

  it('shows the options when the remembered session is gone', async () => {
    localStorage.setItem(PROVIDER_STORAGE_KEY, 'dex-auth-provider');
    const main = mockAuthApi();
    main.getBackstageIdentity.mockResolvedValueOnce(undefined as any);
    const { onSignInSuccess } = renderPage({ main });

    expect(
      await screen.findByRole('button', { name: 'Sign in with GitHub' }),
    ).toBeInTheDocument();
    expect(onSignInSuccess).not.toHaveBeenCalled();
  });

  it('shows a failed sign-in on the page and forgets the provider', async () => {
    const main = mockAuthApi();
    main.getBackstageIdentity.mockRejectedValueOnce(
      Object.assign(new Error('Login failed, popup was closed'), {
        name: 'PopupClosedError',
      }),
    );
    const { onSignInSuccess } = renderPage({ main });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in with GitHub' }),
    );

    expect(
      await screen.findByText('Sign-in did not complete'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Login failed, popup was closed'),
    ).toBeInTheDocument();
    expect(onSignInSuccess).not.toHaveBeenCalled();
    expect(localStorage.getItem(PROVIDER_STORAGE_KEY)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Sign in with GitHub' }),
    ).toBeEnabled();
  });

  it('explains a blocked popup', async () => {
    const main = mockAuthApi();
    main.getBackstageIdentity.mockRejectedValueOnce(
      Object.assign(new Error('Failed to open auth popup.'), {
        name: 'PopupRejectedError',
      }),
    );
    renderPage({ main });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in with GitHub' }),
    );

    expect(
      await screen.findByText('The sign-in window was blocked'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Sign-in did not complete'),
    ).not.toBeInTheDocument();
  });

  it('shows the error the auth backend redirected back with', async () => {
    renderPage({ path: '/?error=Access%20denied' });

    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });

  it('marks the document as the shell while it shows on a classic URL', async () => {
    const { result } = renderPage({ path: '/catalog' });
    await screen.findByRole('heading', { name: 'Agent Platform' });

    expect(document.documentElement).toHaveAttribute('data-agent-shell', '');
    result.unmount();
    expect(document.documentElement).not.toHaveAttribute('data-agent-shell');
  });

  it('leaves the mark to the theme root on the agent area', async () => {
    // AgentShellThemeRoot owns the mark on `/` and keeps it after sign-in.
    document.documentElement.dataset.agentShell = '';
    const { result } = renderPage({ path: '/' });
    await screen.findByRole('heading', { name: 'Agent Platform' });

    result.unmount();
    expect(document.documentElement).toHaveAttribute('data-agent-shell', '');
  });
});
