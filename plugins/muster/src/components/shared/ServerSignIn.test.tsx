import { act, screen, waitFor } from '@testing-library/react';
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
  const rendered = await renderInTestApp(
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
  return { queryClient, ...rendered };
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
   * muster#1083: the challenge names how muster identifies itself to the
   * authorization server. `cimd-fallback` is the one case where the AS may
   * reject the sign-in as an unregistered client, so it gets a warning up
   * front instead of an opaque failure on the IdP's page.
   */
  it('warns when the AS supports neither CIMD nor client registration', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
      signIn: {
        status: 'auth_required',
        authUrl: 'https://muster.gazelle.example.io/oauth/proxy/start?state=x',
        message: CHALLENGE,
        clientIdMethod: 'cimd-fallback',
      },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(/may be rejected as an unregistered client/),
    ).toBeInTheDocument();
    // The sign-in link still works — the fallback often succeeds.
    expect(
      screen.getByRole('link', { name: /Open sign-in page/ }),
    ).toBeInTheDocument();
  });

  /**
   * muster#1086: a rejected registration is its own case — the AS does offer
   * client registration, so the cimd-fallback wording ("advertises neither")
   * would be false. The warning names the rejection instead.
   */
  it('warns when the AS rejected the automatic client registration', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
      signIn: {
        status: 'auth_required',
        authUrl: 'https://muster.gazelle.example.io/oauth/proxy/start?state=x',
        message: CHALLENGE,
        clientIdMethod: 'dcr-failed',
      },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(
        /rejected muster's automatic client registration/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open sign-in page/ }),
    ).toBeInTheDocument();
  });

  it('notes when muster registered itself via Dynamic Client Registration', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
      signIn: {
        status: 'auth_required',
        authUrl: 'https://muster.gazelle.example.io/oauth/proxy/start?state=x',
        message: CHALLENGE,
        clientIdMethod: 'dcr',
      },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(
      await screen.findByText(/Dynamic Client Registration/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/may be rejected as an unregistered client/),
    ).not.toBeInTheDocument();
  });

  it('shows neither note when the AS advertises CIMD support', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
      signIn: {
        status: 'auth_required',
        authUrl: 'https://muster.gazelle.example.io/oauth/proxy/start?state=x',
        message: CHALLENGE,
        clientIdMethod: 'cimd',
      },
    });
    await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await screen.findByRole('link', { name: /Open sign-in page/ });
    expect(
      screen.queryByText(/may be rejected as an unregistered client/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Dynamic Client Registration/),
    ).not.toBeInTheDocument();
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
   * explains a wait that can never end. The proxy answers 200 with
   * `unavailable` (a 5xx per 5s poll would flood Sentry), so the flag is the
   * only signal available.
   */
  it('reports an unreadable auth status once a sign-in is outstanding', async () => {
    const api = makeApi({});
    api.getAuthStatus.mockResolvedValue({
      servers: [],
      unavailable: true,
      message: 'auth://status returned no text content',
    });
    await renderSignIn(api);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in' }),
    );

    expect(
      await screen.findByText(
        /Cannot read the muster auth status: auth:\/\/status returned no text content/,
      ),
    ).toBeInTheDocument();
  });

  it('stays quiet about an unreadable status when no sign-in is outstanding', async () => {
    const api = makeApi({});
    api.getAuthStatus.mockResolvedValue({
      servers: [],
      unavailable: true,
      message: 'auth://status returned no text content',
    });
    await renderSignIn(api);

    await waitFor(() => expect(api.getAuthStatus).toHaveBeenCalled());
    expect(
      screen.queryByText(/Cannot read the muster auth status/),
    ).not.toBeInTheDocument();
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

  /**
   * The sequence from the review: the row is signable, muster refuses with
   * something specific, and the next status read reports the server as
   * SSO-managed. The paragraph is the better general explanation, but it must not
   * swallow the rate-limit message.
   */
  it('keeps muster\u2019s refusal visible under the SSO explanation', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'auth_required' },
      signIn: {
        status: 'error',
        message: 'Rate limit exceeded. Too many authentication attempts.',
      },
    });
    const { queryClient } = await renderSignIn(api);

    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText(/Rate limit exceeded/)).toBeInTheDocument();

    // muster now reports the server as SSO-managed.
    api.getAuthStatus.mockResolvedValue({
      servers: [
        { name: 'pro', status: 'failed', token_exchange_enabled: true },
      ],
    });
    await act(async () => {
      await queryClient.invalidateQueries({
        queryKey: ['muster', 'auth-status', 'gazelle'],
      });
    });

    expect(
      await screen.findByText(/authenticates through SSO/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Rate limit exceeded/)).toBeInTheDocument();
  });

  /**
   * `sso_attempt_failed` names a concrete misconfiguration, and the MCP servers
   * page -- the only surface that passes `onlyWhenRequired` -- is where an
   * operator would look for it, so the gate must let it through even though
   * `failed` is not an auth-required status.
   */
  it('shows the SSO failure diagnosis even when only shown on demand', async () => {
    const api = makeApi({
      status: {
        name: 'pro',
        status: 'failed',
        token_exchange_enabled: true,
        sso_attempt_failed: true,
      },
    });
    await renderSignIn(api, { onlyWhenRequired: true });

    expect(await screen.findByText(/trusted audiences/)).toBeInTheDocument();
  });

  it('stays hidden for a healthy SSO server when only shown on demand', async () => {
    const api = makeApi({
      status: {
        name: 'pro',
        status: 'connected',
        token_exchange_enabled: true,
      },
    });
    await renderSignIn(api, { onlyWhenRequired: true });

    await waitFor(() => expect(api.getAuthStatus).toHaveBeenCalled());
    expect(
      screen.queryByText(/authenticates through SSO/),
    ).not.toBeInTheDocument();
  });
});
