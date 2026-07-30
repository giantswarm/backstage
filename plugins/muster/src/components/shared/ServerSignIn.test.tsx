import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import {
  AuthStatusResponse,
  MusterApi,
  musterApiRef,
  ServerAuthStatus,
  ServerSignInResult,
} from '../../apis';
import { ServerSignIn } from './ServerSignIn';

const CHALLENGE = [
  'Authentication Required',
  '',
  'Server: pro',
  '',
  'Please sign in to connect to this server:',
  '',
  'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
].join('\n');

type Api = Pick<MusterApi, 'getAuthStatus' | 'signInServer'>;

function makeApi(options: {
  status?: ServerAuthStatus;
  signIn?: ServerSignInResult;
}): jest.Mocked<Api> {
  const response: AuthStatusResponse = {
    servers: options.status ? [options.status] : [],
  };
  return {
    getAuthStatus: jest.fn(() => Promise.resolve(response)),
    signInServer: jest.fn((_server: string, _installation?: string) =>
      Promise.resolve(
        options.signIn ?? {
          status: 'auth_required',
          authUrl:
            'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
          message: CHALLENGE,
        },
      ),
    ),
  };
}

async function renderSignIn(
  api: Api,
  props: { onlyWhenRequired?: boolean } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <ServerSignIn
          serverName="pro"
          installation="gazelle"
          showName
          {...props}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('ServerSignIn', () => {
  it('offers muster’s sign-in URL as a link after starting the flow', async () => {
    const api = makeApi({
      status: {
        name: 'pro',
        status: 'auth_required',
        auth_tool: 'core_auth_login',
      },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(api.signInServer).toHaveBeenCalledWith('pro', 'gazelle');
    });
    const link = await screen.findByRole('link', {
      name: /Open sign-in page/,
    });
    expect(link).toHaveAttribute(
      'href',
      'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(
      screen.getByText(/Waiting for you to finish signing in/),
    ).toBeInTheDocument();
  });

  it('keeps the button when muster reports the server already connected', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
      signIn: {
        status: 'connected',
        message: "Server 'pro' is already authenticated and connected.",
      },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(api.signInServer).toHaveBeenCalled();
    });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('surfaces muster’s own message when it refuses the login', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
      signIn: {
        status: 'error',
        message: 'OAuth is not configured.',
      },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText('OAuth is not configured.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('explains SSO-managed servers instead of offering a sign-in', async () => {
    const api = makeApi({
      status: {
        name: 'pro',
        status: 'auth_required',
        token_exchange_enabled: true,
        sso_attempt_failed: true,
      },
    });
    await renderSignIn(api);

    expect(
      await screen.findByText(/authenticates through SSO/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/trusted audiences/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /**
   * The completion signal: muster's OAuth callback connects the server for this
   * session, and the only way the UI learns about it is auth://status flipping
   * to `connected` (the same condition muster's CLI waits for).
   */
  it('drops the waiting state once auth://status reports the server connected', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('link', { name: /Open sign-in page/ });

    // The browser flow completes: the next poll sees the server connected.
    api.getAuthStatus.mockResolvedValue({
      servers: [{ name: 'pro', status: 'connected' }],
    });

    await waitFor(
      () => {
        expect(screen.queryByRole('link')).not.toBeInTheDocument();
      },
      { timeout: 10_000 },
    );
  }, 15_000);

  it('surfaces a failing auth status read instead of waiting forever', async () => {
    const api = makeApi({ status: { name: 'pro', status: 'auth_required' } });
    api.getAuthStatus.mockRejectedValue(
      new Error('Muster resource auth://status returned no text content'),
    );
    await renderSignIn(api);

    expect(
      await screen.findByText(
        /Auth status: Muster resource auth:\/\/status returned no text content/,
      ),
    ).toBeInTheDocument();
  });

  it('renders nothing for a connected server when only shown on demand', async () => {
    const api = makeApi({ status: { name: 'pro', status: 'connected' } });
    await renderSignIn(api, { onlyWhenRequired: true });

    await waitFor(() => {
      expect(api.getAuthStatus).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('pro')).not.toBeInTheDocument();
  });
});
