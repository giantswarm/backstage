import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp, TestApiProvider } from '@backstage/test-utils';
import { AuthStatusResponse, musterApiRef } from '../../apis';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import {
  OAUTH_SIGN_IN_GATE,
  ServerMutationActions,
} from './ServerMutationActions';

function makeServer(options: {
  state?: MCPServerState;
  authType?: 'oauth' | 'none' | 'sigv4';
  suspended?: boolean;
  /** Marks the CR GitOps-managed (Helm provenance label). */
  managed?: boolean;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: 'miro',
        ...(options.managed
          ? { labels: { 'app.kubernetes.io/managed-by': 'Helm' } }
          : {}),
      },
      spec: {
        type: 'streamable-http',
        url: 'https://mcp.miro.com/',
        ...(options.suspended !== undefined
          ? { suspended: options.suspended }
          : {}),
        ...(options.authType ? { auth: { type: options.authType } } : {}),
      },
      ...(options.state ? { status: { state: options.state } } : {}),
    } as never,
    'gazelle',
  );
}

async function renderActions(
  server: MCPServer,
  options: { authenticated?: boolean; authStatus?: AuthStatusResponse } = {},
) {
  const musterApi = {
    callTool: jest.fn(),
    getAuthStatus: jest.fn(() =>
      Promise.resolve(options.authStatus ?? { servers: [] }),
    ),
    signInServer: jest.fn(),
    signOutServer: jest.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <ServerMutationActions
          server={server}
          authenticated={options.authenticated}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
}

describe('ServerMutationActions lifecycle affordances', () => {
  it('shows Deactivate + Reconnect (never Activate) for an active server', async () => {
    await renderActions(makeServer({ state: 'Connected' }));

    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Activate' }),
    ).not.toBeInTheDocument();
  });

  it('shows only Activate for a suspended server', async () => {
    // Activate/Deactivate are two directions of one durable switch
    // (spec.suspended), so exactly one renders; Reconnect is hidden because
    // muster refuses core_service_restart while suspended.
    await renderActions(
      makeServer({ state: 'Disconnected', suspended: true, authType: 'oauth' }),
    );

    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Deactivate' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Reconnect' }),
    ).not.toBeInTheDocument();
    // Delete stays live regardless of lifecycle state.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
  });

  it('disables Reconnect for an OAuth server waiting on sign-in', async () => {
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth' }),
    );

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeDisabled();
    // Deactivate (suspend) is always a valid write for OAuth servers.
    expect(screen.getByRole('button', { name: 'Deactivate' })).toBeEnabled();
  });

  it('explains the Reconnect gate and points at the sign-in flow', async () => {
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth' }),
    );

    await userEvent.hover(
      screen.getByRole('button', { name: 'Reconnect' })
        .parentElement as Element,
    );
    expect(await screen.findByText(OAUTH_SIGN_IN_GATE)).toBeInTheDocument();
  });

  it('keeps Reconnect live for a failed OAuth server (retry path)', async () => {
    // The gate is state-scoped, not type-scoped: reconnecting a *failed*
    // OAuth server is a valid retry that muster accepts.
    await renderActions(makeServer({ state: 'Failed', authType: 'oauth' }));

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
  });

  it('keeps Reconnect live for non-OAuth servers regardless of state', async () => {
    await renderActions(makeServer({ state: 'Auth Required' }));

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
  });

  it('says what muster will do in the confirm dialog', async () => {
    await renderActions(makeServer({ state: 'Connected' }));

    await userEvent.click(screen.getByRole('button', { name: 'Deactivate' }));

    expect(
      await screen.findByText(/keep it deactivated until it is activated/),
    ).toBeInTheDocument();
    // The underlying tool stays visible for transparency.
    expect(screen.getByText('core_service_stop')).toBeInTheDocument();
  });

  it('keeps Reconnect live for a sigv4 server: reconnecting is the remedy', async () => {
    // A sigv4 server has no per-user sign-in, so nothing about it is waiting on
    // a session. muster keeps a rejected credential in `Failed` and retries;
    // reconnecting after fixing the region or the role is exactly the right
    // move, and the OAuth sign-in gate must not swallow it.
    await renderActions(makeServer({ state: 'Failed', authType: 'sigv4' }));

    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
  });
});

/**
 * The action row also carries the per-session auth actions (Sign in / Sign
 * out): the sign-in used to live under "Authentication / token chain", where
 * the one action an Auth Required server needs was easy to miss among the
 * read-only detail.
 */
describe('ServerMutationActions session auth affordances', () => {
  const AUTH_REQUIRED: AuthStatusResponse = {
    servers: [
      { name: 'miro', status: 'auth_required', auth_tool: 'core_auth_login' },
    ],
  };
  const CONNECTED: AuthStatusResponse = {
    servers: [{ name: 'miro', status: 'connected' }],
  };

  it('puts Sign in in the action row for an auth-gated server', async () => {
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth' }),
      { authenticated: true, authStatus: AUTH_REQUIRED },
    );

    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    // Same row as the lifecycle/CRUD affordances.
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });

  it('offers Sign out for a connected OAuth server', async () => {
    await renderActions(makeServer({ state: 'Connected', authType: 'oauth' }), {
      authenticated: true,
      authStatus: CONNECTED,
    });

    expect(
      await screen.findByRole('button', { name: 'Sign out' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('offers no Sign out for a connected server without OAuth', async () => {
    // auth://status reports no-auth servers as connected too; nothing to undo.
    await renderActions(makeServer({ state: 'Connected' }), {
      authenticated: true,
      authStatus: CONNECTED,
    });

    expect(await screen.findByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Sign out' }),
    ).not.toBeInTheDocument();
  });

  it('renders the auth actions in the GitOps-managed row too', async () => {
    // Signing in is a session action, not a CRD mutation, so read-only
    // provenance must not hide it.
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth', managed: true }),
      { authenticated: true, authStatus: AUTH_REQUIRED },
    );

    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    expect(screen.getByText('GitOps-managed (read-only)')).toBeInTheDocument();
  });

  it('offers no auth actions for a sigv4 server', async () => {
    // sigv4 signs as muster's own machine identity: no user sign-in exists,
    // and a Sign in/Sign out here could never help (mirrors muster's
    // CanAuthenticateInteractively).
    await renderActions(
      makeServer({ state: 'Failed', authType: 'sigv4' }),
      // auth://status should not even matter, but make it maximally tempting.
      { authenticated: true, authStatus: AUTH_REQUIRED },
    );

    expect(await screen.findByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the row auth-free without a muster session', async () => {
    // The downstream flow is scoped to the muster session; without one the
    // status read behind the affordance would just 401.
    await renderActions(
      makeServer({ state: 'Auth Required', authType: 'oauth' }),
      { authStatus: AUTH_REQUIRED },
    );

    expect(await screen.findByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });
});
