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

  /**
   * muster answering "already connected" while the alert still lists the server
   * is a real combination (the two come from different muster state). Saying
   * nothing there is indistinguishable from the no-op click this feature fixes.
   */
  it('reports muster\u2019s answer when the server is already connected', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
      signIn: {
        status: 'connected',
        message: "Server 'pro' is already authenticated and connected.",
      },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(
        "Server 'pro' is already authenticated and connected.",
      ),
    ).toBeInTheDocument();
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
   * A broken status read is what turned this into a silent forever-wait, so it
   * is surfaced -- but only once a sign-in is outstanding, since that is when it
   * explains a wait that can never end.
   */
  it('surfaces a failing auth status read once a sign-in is outstanding', async () => {
    const api = makeApi({ status: { name: 'pro', status: 'auth_required' } });
    api.getAuthStatus.mockRejectedValue(
      new Error('auth://status returned no text content'),
    );
    await renderSignIn(api);

    expect(
      screen.queryByText(/auth:\/\/status returned no text content/),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(
        /Auth status: auth:\/\/status returned no text content/,
      ),
    ).toBeInTheDocument();
  });

  /**
   * The MCP servers page renders this above its own "connect to muster" gate, so
   * a 401 from the status read must not conjure a row (with a button that would
   * 401 too) next to every expanded server.
   */
  it('stays hidden on a status error when only shown on demand', async () => {
    const api = makeApi({});
    api.getAuthStatus.mockRejectedValue(
      new Error("installation 'gazelle' requires a user token"),
    );
    await renderSignIn(api, { onlyWhenRequired: true });

    await waitFor(() => {
      expect(api.getAuthStatus).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/requires a user token/)).not.toBeInTheDocument();
  });

  /**
   * The tool explorer renders rows without `onlyWhenRequired` because muster
   * already said these servers are auth-gated. An SSO server whose status is not
   * one of the auth-required values must still explain itself rather than
   * leaving the alert with no name, action, or reason.
   */
  it('explains an SSO server whose status is not auth-required', async () => {
    const api = makeApi({
      status: {
        name: 'pro',
        status: 'failed',
        token_forwarding_enabled: true,
      },
    });
    await renderSignIn(api);

    expect(
      await screen.findByText(/authenticates through SSO/),
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
