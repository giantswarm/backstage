import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { AuthStatusResponse, musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { MCPServer, MCPServerState } from '../../lib/k8s';
import { DEACTIVATED_SIGN_IN_GATE } from '../shared';
import { IntegrationServerDisclosure } from './IntegrationServerDisclosure';

/** An ad-hoc OAuth server, as registered through the portal. */
function makeServer(options: {
  state: MCPServerState;
  suspended?: boolean;
  /** muster's Ready condition message, the state badge's tooltip. */
  explanation?: string;
  /** The Ready condition's status and reason; defaults to a healthy one. */
  ready?: { status: 'True' | 'False'; reason: string };
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name: 'miro' },
      spec: {
        type: 'streamable-http',
        url: 'https://mcp.miro.com/',
        auth: { type: 'oauth' },
        ...(options.suspended ? { suspended: true } : {}),
      },
      status: {
        state: options.state,
        lastConnected: '2026-08-31T18:40:00Z',
        ...(options.explanation
          ? {
              conditions: [
                {
                  type: 'Ready',
                  status: options.ready?.status ?? 'True',
                  reason: options.ready?.reason ?? 'AwaitingSession',
                  message: options.explanation,
                },
              ],
            }
          : {}),
      },
    } as never,
    'gazelle',
  );
}

/** muster's view of the same server: the session is still signed in. */
const RUNTIME = {
  mcpServers: [
    {
      name: 'miro',
      state: 'Disconnected',
      sessionStatus: 'connected',
      toolsCount: 58,
    },
  ],
};

const AUTH_REQUIRED: AuthStatusResponse = {
  servers: [
    { name: 'miro', status: 'auth_required', auth_tool: 'core_auth_login' },
  ],
};

async function render(server: MCPServer) {
  const musterApi = {
    listServers: jest.fn().mockResolvedValue(RUNTIME),
    filterTools: jest.fn().mockResolvedValue({ tools: [], total: 0 }),
    getAuthStatus: jest.fn().mockResolvedValue(AUTH_REQUIRED),
    callTool: jest.fn(),
    signInServer: jest.fn(),
    signOutServer: jest.fn(),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <IntegrationServerDisclosure
          server={server}
          authenticated
          defaultExpanded
        />
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/agent-platform/muster': rootRouteRef } },
  );
}

/** Whether `a` comes before `b` in the document. */
function precedes(a: HTMLElement, b: HTMLElement): boolean {
  // eslint-disable-next-line no-bitwise
  return Boolean(
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
}

/**
 * The page a deactivated ad-hoc server used to render: `Disconnected`, a
 * Configuration block without the suspension, "may be down or unreachable",
 * Sign in on offer, and the runtime block claiming a connected session with 58
 * tools. The Activate button was the only trace of the deactivation.
 */
describe('IntegrationServerDisclosure for a deactivated server', () => {
  it('leads with Deactivated, ahead of the live state', async () => {
    await render(makeServer({ state: 'Disconnected', suspended: true }));

    // The header is the accordion trigger; the Configuration block below
    // carries a "Deactivated" row of its own, so scope to the header.
    const header = await screen.findByRole('button', { expanded: true });
    const badge = within(header).getByText('Deactivated');
    const live = within(header).getByText('Disconnected');
    expect(precedes(badge, live)).toBe(true);
  });

  it('carries the deactivation through every block of the detail', async () => {
    await render(makeServer({ state: 'Disconnected', suspended: true }));

    // Configuration names the switch and where to flip it.
    expect(
      await screen.findByText(
        /muster keeps it disconnected until it is activated/,
      ),
    ).toBeInTheDocument();
    // The tools block blames the deactivation, not reachability.
    expect(
      await screen.findByText(/No tools exposed — this server is deactivated/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/down or unreachable/)).not.toBeInTheDocument();
    // The runtime block's stale session is marked as such.
    expect(await screen.findByText('58')).toBeInTheDocument();
    expect(
      screen.getByText(
        /the Session, Tools, Resources and Prompts rows are your session's last/,
      ),
    ).toBeInTheDocument();
    // Sign in is on the page but gated; Activate is the live action.
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled();
    expect(
      screen.queryByText(DEACTIVATED_SIGN_IN_GATE),
    ).not.toBeInTheDocument();
  });

  it('says none of that for an active server', async () => {
    await render(makeServer({ state: 'Disconnected' }));

    expect(await screen.findByText(/down or unreachable/)).toBeInTheDocument();
    expect(screen.queryByText('Deactivated')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/the Session, Tools, Resources and Prompts rows/),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeEnabled();
  });
});

/**
 * The state badge explains itself: muster's Ready condition message is the
 * badge's tooltip, and the Health block carries it as a row, so a person can
 * tell "Awaiting Session" (served per session, nobody connected) from a
 * broken server without leaving the page.
 */
describe('IntegrationServerDisclosure state explanation', () => {
  const EXPLANATION =
    "Served per session: each caller's own token is forwarded to the server; muster holds no connection of its own. No session is connected.";

  it('puts the Ready condition message on the state badge as its tooltip', async () => {
    await render(
      makeServer({ state: 'Awaiting Session', explanation: EXPLANATION }),
    );

    const header = await screen.findByRole('button', { expanded: true });
    const badge = within(header).getByText('Awaiting Session');
    await userEvent.hover(badge);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(EXPLANATION);
    // A healthy server has no Diagnostics block to repeat it in.
    expect(screen.queryByText('Diagnostics')).not.toBeInTheDocument();
  });

  it('shows the Ready condition as a diagnostics row on a failed server', async () => {
    // A token exchange broken for every caller: the reason names the class,
    // the message the Secret to fix -- next to the last error muster kept.
    await render(
      makeServer({
        state: 'Failed',
        explanation:
          'token exchange credentials from Secret agent-platform/miro-token-exchange-credentials: secrets "miro-token-exchange-credentials" not found',
        ready: { status: 'False', reason: 'TokenExchangeCredentials' },
      }),
    );

    expect(await screen.findByText('Diagnostics')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(
      screen.getByText(
        /no \(TokenExchangeCredentials\) — token exchange credentials from Secret/,
      ),
    ).toBeInTheDocument();
  });
});
