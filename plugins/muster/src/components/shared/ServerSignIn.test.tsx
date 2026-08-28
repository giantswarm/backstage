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
  ServerSignOutResult,
} from '../../apis';
import { ServerAuthActions, ServerSignIn } from './ServerSignIn';

const CHALLENGE = [
  'Authentication Required',
  '',
  'Server: pro',
  '',
  'Please sign in to connect to this server:',
  '',
  'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
].join('\n');

type Api = Pick<MusterApi, 'getAuthStatus' | 'signInServer' | 'signOutServer'>;

function makeApi(options: {
  status?: ServerAuthStatus;
  signIn?: ServerSignInResult;
  signOut?: ServerSignOutResult;
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
    signOutServer: jest.fn((_server: string, _installation?: string) =>
      Promise.resolve(
        options.signOut ?? {
          status: 'signed_out',
          message:
            "Successfully logged out from 'pro'.\n\nThe server's tools are " +
            "now hidden. Use core_auth_login with server='pro' to " +
            're-authenticate.',
        },
      ),
    ),
  };
}

async function renderSignIn(api: Api) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <ServerSignIn serverName="pro" installation="gazelle" showName />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { queryClient, ...rendered };
}

async function renderAuthActions(
  api: Api,
  props: { oauthConfigured?: boolean } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const rendered = await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <ServerAuthActions serverName="pro" installation="gazelle" {...props} />
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
   * The tool explorer renders these rows because muster already said the
   * servers are auth-gated. An SSO server whose status is not one of the
   * auth-required values must still explain itself rather than leaving the
   * alert with no name, action, or reason.
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
});

/**
 * The MCP servers page's action-row variant: gates itself on `auth://status`
 * (the connected majority renders nothing), signs in prominently, and adds
 * the sign-out affordance for connected per-user OAuth servers.
 */
describe('ServerAuthActions', () => {
  it('offers a sign-in for a server muster reports as needing one', async () => {
    const api = makeApi({
      status: {
        name: 'pro',
        status: 'auth_required',
        auth_tool: 'core_auth_login',
      },
    });
    await renderAuthActions(api);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign in' }),
    );

    await waitFor(() => {
      expect(api.signInServer).toHaveBeenCalledWith('pro', 'gazelle');
    });
    expect(
      await screen.findByRole('link', { name: /Open sign-in page/ }),
    ).toBeInTheDocument();
  });

  /**
   * The MCP servers page renders this above its own "connect to muster" gate,
   * so a 401 from the status read must not conjure a row (with a button that
   * would 401 too) next to every expanded server.
   */
  it('stays hidden on a status error', async () => {
    const api = makeApi({});
    api.getAuthStatus.mockRejectedValue(
      new Error("installation 'gazelle' requires a user token"),
    );
    await renderAuthActions(api);

    await waitFor(() => {
      expect(api.getAuthStatus).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/requires a user token/)).not.toBeInTheDocument();
  });

  /**
   * `connected` alone is not enough for a sign-out: `auth://status` reports a
   * no-auth server as connected too, and muster's logout would be a no-op the
   * user cannot interpret. The CR's declared `spec.auth.type` is the signal
   * that the connection is a user sign-in that can be undone.
   */
  it('renders nothing for a connected server without declared OAuth', async () => {
    const api = makeApi({ status: { name: 'pro', status: 'connected' } });
    await renderAuthActions(api);

    await waitFor(() => {
      expect(api.getAuthStatus).toHaveBeenCalled();
    });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('pro')).not.toBeInTheDocument();
  });

  it('signs a connected OAuth server out and re-gates on muster’s answer', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'connected' },
      signOut: {
        status: 'signed_out',
        message:
          "Successfully logged out from 'pro'.\n\nThe server's tools are " +
          "now hidden. Use core_auth_login with server='pro' to " +
          're-authenticate.',
      },
    });
    await renderAuthActions(api, { oauthConfigured: true });

    // The sign-out re-gates the server: the invalidated status read now says
    // auth_required, so the affordance must flip back to a sign-in.
    api.getAuthStatus.mockResolvedValue({
      servers: [
        { name: 'pro', status: 'auth_required', auth_tool: 'core_auth_login' },
      ],
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    );

    await waitFor(() => {
      expect(api.signOutServer).toHaveBeenCalledWith('pro', 'gazelle');
    });
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    // A UI-authored confirmation stays visible next to the flipped affordance.
    // Muster's verbatim text is not shown: it tells the user to run
    // core_auth_login, CLI advice that contradicts the Sign in button.
    expect(
      screen.getByText(
        "Signed out — the server's tools are hidden until you sign in again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/core_auth_login/)).not.toBeInTheDocument();
  });

  it('surfaces muster’s own message when it refuses the logout', async () => {
    const api = makeApi({
      status: { name: 'pro', status: 'connected' },
      signOut: {
        status: 'error',
        message: "Server 'pro' not found.",
      },
    });
    await renderAuthActions(api, { oauthConfigured: true });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sign out' }),
    );

    expect(
      await screen.findByText("Server 'pro' not found."),
    ).toBeInTheDocument();
    // A refusal changed nothing, so the affordance stays a sign-out.
    expect(
      screen.getByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
  });

  /**
   * `sso_attempt_failed` names a concrete misconfiguration, and the MCP servers
   * page is where an operator would look for it, so the idle gate must let it
   * through even though `failed` is not an auth-required status.
   */
  it('shows the SSO failure diagnosis', async () => {
    const api = makeApi({
      status: {
        name: 'pro',
        status: 'failed',
        token_exchange_enabled: true,
        sso_attempt_failed: true,
      },
    });
    await renderAuthActions(api);

    expect(await screen.findByText(/trusted audiences/)).toBeInTheDocument();
  });

  it('stays hidden for a healthy SSO server', async () => {
    const api = makeApi({
      status: {
        name: 'pro',
        status: 'connected',
        token_exchange_enabled: true,
      },
    });
    // Standard SSO servers can also declare `spec.auth` -- the SSO gate must
    // outrank the sign-out affordance, since muster refuses their logout.
    await renderAuthActions(api, { oauthConfigured: true });

    await waitFor(() => expect(api.getAuthStatus).toHaveBeenCalled());
    expect(
      screen.queryByText(/authenticates through SSO/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
