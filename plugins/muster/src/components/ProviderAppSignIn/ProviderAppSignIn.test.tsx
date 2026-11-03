import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  AuthStatusResponse,
  MusterApi,
  musterApiRef,
  ProviderAppAuthStatus,
  ServerSignInResult,
  SignInTarget,
} from '../../apis';
import { ProviderAppSignIn } from './ProviderAppSignIn';

type Api = Pick<MusterApi, 'getAuthStatus' | 'signInServer' | 'signOutServer'>;

const DEVICE_PAGE = 'https://auth.openai.com/codex/device';
const inTenMinutes = () => new Date(Date.now() + 10 * 60_000).toISOString();

const pendingAnswer = (): ServerSignInResult => ({
  status: 'pending',
  message: "Connect provider App 'chatgpt'",
  deviceCode: {
    userCode: 'ABCD-EFGH',
    verificationUrl: DEVICE_PAGE,
    expiresAt: inTenMinutes(),
  },
});

/** muster, as far as the row reads it: one App, whose entry tests change. */
function makeMuster(initial: ProviderAppAuthStatus) {
  const state = { app: initial };
  const api: jest.Mocked<Api> = {
    getAuthStatus: jest.fn(() =>
      Promise.resolve<AuthStatusResponse>({
        servers: [],
        providerApps: [{ ...state.app }],
      }),
    ),
    signInServer: jest.fn((_target: SignInTarget, _installation?: string) => {
      state.app = {
        name: 'chatgpt',
        status: 'pending',
        user_code: 'ABCD-EFGH',
        verification_url: DEVICE_PAGE,
        code_expires_at: inTenMinutes(),
      };
      return Promise.resolve(pendingAnswer());
    }),
    signOutServer: jest.fn((_target: SignInTarget, _installation?: string) => {
      state.app = { name: 'chatgpt', status: 'auth_required' };
      return Promise.resolve({
        status: 'signed_out' as const,
        message: "Disconnected provider App 'chatgpt'",
      });
    }),
  };
  return { api, state };
}

async function renderRow(api: Api) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <ProviderAppSignIn
          app="chatgpt"
          installation="graveler"
          pollIntervalMs={20}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('ProviderAppSignIn', () => {
  let windowOpen: jest.SpyInstance;
  let tab: { closed: boolean; opener: unknown; location: { href: string } };

  beforeEach(() => {
    tab = { closed: false, opener: {}, location: { href: '' } };
    windowOpen = jest
      .spyOn(window, 'open')
      .mockReturnValue(tab as unknown as Window);
  });

  afterEach(() => {
    windowOpen.mockRestore();
  });

  it('shows a person without the grant as not connected, with Connect', async () => {
    const { api } = makeMuster({ name: 'chatgpt', status: 'auth_required' });
    await renderRow(api);

    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('shows a code muster reports outstanding, with its link and a copy button', async () => {
    const { api } = makeMuster({
      name: 'chatgpt',
      status: 'pending',
      user_code: 'WXYZ-1234',
      verification_url: DEVICE_PAGE,
      code_expires_at: inTenMinutes(),
    });
    await renderRow(api);

    expect(
      await screen.findByText('Waiting for your code'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('provider-app-user-code')).toHaveTextContent(
      'WXYZ-1234',
    );
    expect(screen.getByRole('link', { name: DEVICE_PAGE })).toHaveAttribute(
      'href',
      DEVICE_PAGE,
    );
    expect(
      screen.getByRole('button', { name: 'Copy the code WXYZ-1234' }),
    ).toBeInTheDocument();
    expect(screen.getByText('(10 min)')).toBeInTheDocument();
    expect(
      screen.getByText(/Device-code sign-in may need to be enabled/),
    ).toBeInTheDocument();
  });

  it('copies the code', async () => {
    const writeText = jest.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const { api } = makeMuster({
      name: 'chatgpt',
      status: 'pending',
      user_code: 'WXYZ-1234',
      verification_url: DEVICE_PAGE,
    });
    await renderRow(api);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Copy the code WXYZ-1234' }),
    );

    expect(writeText).toHaveBeenCalledWith('WXYZ-1234');
    expect(
      await screen.findByRole('button', { name: 'Copy the code WXYZ-1234' }),
    ).toHaveTextContent('Copied');
  });

  it('shows a connected person as connected, with Disconnect', async () => {
    const { api } = makeMuster({ name: 'chatgpt', status: 'connected' });
    await renderRow(api);

    expect(await screen.findByText('✓ Connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
  });

  it("shows a failed sign-in with muster's reason, and offers to try again", async () => {
    const { api } = makeMuster({
      name: 'chatgpt',
      status: 'auth_required',
      last_failure:
        'device-code sign-in is not enabled for this ChatGPT account: enable it in ChatGPT Settings → Security',
    });
    await renderRow(api);

    expect(
      await screen.findByText('Not connected: failed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/device-code sign-in is not enabled/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('connects, turns Connected without a reload, disconnects, and reads Not connected', async () => {
    const { api, state } = makeMuster({
      name: 'chatgpt',
      status: 'auth_required',
    });
    await renderRow(api);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Connect' }),
    );

    expect(api.signInServer).toHaveBeenCalledWith(
      { app: 'chatgpt' },
      'graveler',
    );
    expect(
      await screen.findByTestId('provider-app-user-code'),
    ).toHaveTextContent('ABCD-EFGH');
    // The provider's page, in the tab the click opened.
    expect(tab.location.href).toBe(DEVICE_PAGE);

    // The person enters the code at OpenAI; muster files the grant.
    state.app = { name: 'chatgpt', status: 'connected' };
    expect(await screen.findByText('✓ Connected')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));

    expect(api.signOutServer).toHaveBeenCalledWith(
      { app: 'chatgpt' },
      'graveler',
    );
    expect(await screen.findByText('Not connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
  });

  it('ends the wait when muster gives the code up, saying why', async () => {
    const { api, state } = makeMuster({
      name: 'chatgpt',
      status: 'auth_required',
    });
    await renderRow(api);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Connect' }),
    );
    await screen.findByTestId('provider-app-user-code');

    state.app = {
      name: 'chatgpt',
      status: 'auth_required',
      last_failure: 'the code expired before it was entered',
    };

    expect(
      await screen.findByText('Not connected: failed'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('the code expired before it was entered'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId('provider-app-user-code'),
      ).not.toBeInTheDocument(),
    );
  });
});
