import { type ReactNode, useState } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- The portal session is the gs plugin's main sign-in.
import { gsAuthProvidersApiRef } from '@giantswarm/backstage-plugin-gs';
import { musterApiRef } from '../../apis';
import { stubImageLoad } from '../ConnectorLogo/stubImageLoad';
import type { AuthStatusResponse } from '../../apis/types';
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
import { MCPServer, MCPServerState, TOOL_GROUP_LABEL } from '../../lib/k8s';
import { CustomizeConnectorsPanel } from './CustomizeConnectorsPanel';
import { externalUrlConsentApiRef } from '@giantswarm/backstage-plugin-ui-react';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));

let mockServers: MCPServer[] = [];
let mockAuthenticated = true;
let mockSessionPending = false;
let mockInstance: Record<string, unknown> = {};
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: true,
    activeInstallationInfo: { name: 'gazelle', requiresAuth: true },
    mcpServers: mockServers,
    workflows: [],
    isLoading: false,
    ...mockInstance,
  }),
  useMusterSession: () => ({
    authenticated: mockAuthenticated,
    pending: mockSessionPending,
    connecting: false,
    connect: jest.fn(),
  }),
}));

function makeServer(
  name: string,
  options: {
    state?: MCPServerState;
    auth?: Record<string, unknown>;
    description?: string;
    suspended?: boolean;
    toolGroup?: string;
    family?: string;
    displayName?: string;
    tags?: string;
  } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        annotations: {
          ...(options.displayName
            ? { 'ui.giantswarm.io/display-name': options.displayName }
            : {}),
          ...(options.tags ? { 'ui.giantswarm.io/tags': options.tags } : {}),
        },
        labels: options.toolGroup
          ? { [TOOL_GROUP_LABEL]: options.toolGroup }
          : {},
      },
      spec: {
        ...(options.family ? { family: { name: options.family } } : {}),
        type: 'streamable-http',
        url: `https://${name}.example.test/mcp`,
        description: options.description,
        ...(options.auth ? { auth: options.auth } : {}),
        ...(options.suspended ? { suspended: true } : {}),
      },
      status: { state: options.state ?? 'Connected' },
    } as never,
    'gazelle',
  );
}

const servers = () => [
  makeServer('github', {
    auth: { type: 'oauth' },
    state: 'Auth Required',
    description: 'Repositories and pull requests',
  }),
  makeServer('kubernetes', {
    auth: { type: 'oauth', forwardToken: true },
  }),
  makeServer('web-search'),
];

const api = {
  filterTools: jest.fn(async () => ({
    total: 3,
    filtered_count: 3,
    truncated: false,
    tools: [
      { name: 'x_github_list_pulls', description: 'List pull requests' },
      { name: 'x_github_get_issue', description: 'Read an issue' },
      { name: 'x_kubernetes_get_pods', description: 'List pods' },
    ],
  })),
  signInServer: jest.fn(async () => ({
    status: 'auth_required' as const,
    authUrl: 'https://github.example.test/login/oauth/authorize',
    message: 'Sign in to github.',
  })),
  getAuthStatus: jest.fn(async () => defaultAuthStatus()),
  getServerInfo: jest.fn(async (): Promise<{ icon?: string }> => ({})),
};

function defaultAuthStatus(): AuthStatusResponse {
  return {
    servers: [
      {
        name: 'github',
        status: 'auth_required',
        auth_tool: 'core_auth_login',
      },
      { name: 'kubernetes', status: 'connected' },
      { name: 'web-search', status: 'connected' },
    ],
  };
}

/** muster's answer when the SSO connector refused this person's sign-in. */
function ssoFailedAuthStatus(): AuthStatusResponse {
  return {
    servers: [
      { name: 'github', status: 'connected' },
      {
        name: 'kubernetes',
        status: 'reauth_required',
        token_forwarding_enabled: true,
        sso_attempt_failed: true,
        error: 'ID token forwarding failed: 401 Unauthorized',
      },
      { name: 'web-search', status: 'connected' },
    ],
  };
}

/** muster's answer for the SSO connector before it connected it. */
function ssoNotConnectedAuthStatus(): AuthStatusResponse {
  return {
    servers: [
      { name: 'github', status: 'connected' },
      { name: 'kubernetes', status: 'auth_required', kind: 'sso' },
      { name: 'web-search', status: 'connected' },
    ],
  };
}

const SSO_REFUSED =
  "kubernetes uses your portal sign-in, so there is nothing to sign in to. It did not accept that sign-in, so you and your agents cannot use its tools yet. An administrator needs to add the portal sign-in's audience to the connector's trusted audiences.";

let queryClient: QueryClient;
/** The person's answer in the external URL consent dialog. */
const consentOpen = jest.fn();

const mainSessionEnd = {
  reason: jest.fn((): 'signed-in-elsewhere' | undefined => undefined),
  subscribe: () => () => {},
};

async function renderPanel(search = '') {
  return renderInPanelApp(<CustomizeConnectorsPanel search={search} />);
}

/** Renders `ui` with the panel's query client, APIs and routes. */
async function renderInPanelApp(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient = client;
  return renderInTestApp(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
    {
      apis: [
        [musterApiRef, api],
        [externalUrlConsentApiRef, { open: consentOpen }],
        [gsAuthProvidersApiRef, { getMainSessionEnd: () => mainSessionEnd }],
      ],
      mountedRoutes: {
        '/customize/connectors': mcpServersRouteRef,
        '/customize': customizeExternalRouteRef,
      },
    },
  );
}

function rowOf(name: string) {
  return screen.getByRole('row', { name: new RegExp(`^${name}`) });
}

describe('CustomizeConnectorsPanel', () => {
  beforeEach(() => {
    mockServers = servers();
    consentOpen.mockReset().mockResolvedValue('accept');
    mockAuthenticated = true;
    mockSessionPending = false;
    mockInstance = {};
    api.filterTools.mockClear();
    api.getAuthStatus.mockClear();
    api.getAuthStatus.mockImplementation(async () => defaultAuthStatus());
    api.signInServer.mockClear();
    api.getServerInfo.mockReset();
    api.getServerInfo.mockImplementation(async () => ({}));
    mockNavigate.mockClear();
  });

  it('shows a row per connector with its sign-in, tools and state', async () => {
    await renderPanel();

    expect(await screen.findByText('2 tools')).toBeInTheDocument();
    const github = rowOf('github');
    expect(
      within(github).getByText('Repositories and pull requests'),
    ).toBeInTheDocument();
    expect(within(github).getByText('Your own account')).toBeInTheDocument();
    expect(
      await within(github).findByText('Sign in needed'),
    ).toBeInTheDocument();
    expect(
      within(github).getByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();

    const kubernetes = rowOf('kubernetes');
    expect(within(kubernetes).getByText('Company login')).toBeInTheDocument();
    expect(within(kubernetes).getByText('1 tool')).toBeInTheDocument();
    expect(within(kubernetes).getByText('Connected')).toBeInTheDocument();
    expect(
      within(kubernetes).queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();

    expect(
      within(rowOf('web-search')).getByText('No sign-in'),
    ).toBeInTheDocument();
    // Muster itself is listed too, by its name among the rest.
    expect(rowOf('Muster')).toBeInTheDocument();
  });

  it('puts the sign-in in a column of its own, beside the state', async () => {
    await renderPanel();

    const github = rowOf('github');
    const state = (await within(github).findByText('Sign in needed')).closest(
      '[role="gridcell"], [role="cell"], td',
    );
    const button = within(github).getByRole('button', { name: 'Sign in' });
    const buttonCell = button.closest('[role="gridcell"], [role="cell"], td');
    expect(state).not.toBeNull();
    expect(buttonCell).not.toBeNull();
    expect(buttonCell).not.toBe(state);
    expect(state?.nextElementSibling).toBe(buttonCell);
    // Its header names it for a screen reader only.
    expect(
      screen.getByRole('columnheader', { name: 'Actions' }),
    ).toBeInTheDocument();
  });

  it('leaves the sign-in column out where no connector asks for a sign-in', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(
      await screen.findByRole('columnheader', { name: /^Status/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('leaves the sign-in column out where a sign-in has no button: a refused SSO one', async () => {
    api.getAuthStatus.mockImplementation(async () => ssoFailedAuthStatus());
    await renderPanel();

    expect(
      await within(rowOf('kubernetes')).findByText('Cannot connect'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull();
  });

  it('signs in from the row without opening the connector', async () => {
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );

    await waitFor(() =>
      expect(api.signInServer).toHaveBeenCalledWith('github', 'gazelle'),
    );
    expect(mockNavigate).not.toHaveBeenCalled();

    await user.click(
      within(github).getByText('Repositories and pull requests'),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      '/customize/connectors/gazelle/github',
      undefined,
    );
  });

  it('asks no sign-in of an SSO connector muster has not connected yet', async () => {
    api.getAuthStatus.mockImplementation(async () =>
      ssoNotConnectedAuthStatus(),
    );
    await renderPanel();

    const kubernetes = rowOf('kubernetes');
    // Its own state: nothing waits on this person.
    expect(
      await within(kubernetes).findByText('Connected'),
    ).toBeInTheDocument();
    expect(within(kubernetes).queryByText('Sign in needed')).toBeNull();
    expect(within(kubernetes).queryByText('Cannot connect')).toBeNull();
    expect(
      within(kubernetes).queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('says an SSO connector that refused the sign-in cannot connect, the reason in a tooltip (T104)', async () => {
    api.getAuthStatus.mockImplementation(async () => ssoFailedAuthStatus());
    const user = userEvent.setup();
    await renderPanel();

    const kubernetes = rowOf('kubernetes');
    // Not "Sign-in expired": there is nothing to sign in to.
    expect(
      await within(kubernetes).findByText('Cannot connect'),
    ).toBeInTheDocument();
    expect(within(kubernetes).queryByText('Sign-in expired')).toBeNull();
    // The sentence would fill the cell and push the state out of sight.
    expect(within(kubernetes).queryByText(SSO_REFUSED)).toBeNull();
    expect(
      within(kubernetes).queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();

    // react-aria opens a tooltip on hover only once it has seen a pointer
    // move, and a hover's own move lands after its enter.
    await user.hover(document.body);
    await user.hover(
      within(kubernetes).getByRole('button', {
        name: 'About the state of kubernetes',
      }),
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(SSO_REFUSED);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('says a sign-in serving one session covers the portal only, with the why in a hint', async () => {
    const user = userEvent.setup();
    api.getAuthStatus.mockImplementation(async () => ({
      servers: [
        {
          name: 'github',
          status: 'connected',
          kind: 'grant',
          grant_scope: 'session',
        },
        { name: 'kubernetes', status: 'connected' },
        { name: 'web-search', status: 'connected' },
      ],
    }));
    await renderPanel();

    const github = rowOf('github');
    expect(await within(github).findByText('Portal only')).toBeInTheDocument();
    expect(within(github).queryByText('Connected')).toBeNull();
    const hint = within(github).getByRole('button', {
      name: 'About the state of github',
    });
    await user.hover(document.body);
    await user.hover(hint);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Your sign-in to github covers this portal only. Each agent conversation asks you to sign in again.',
    );
    // The hint keeps its press: the row does not open the connector.
    await user.click(hint);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('says Connecting while muster still connects an SSO connector, then Connected without a reload', async () => {
    let connecting = true;
    api.getAuthStatus.mockImplementation(async () => ({
      servers: [
        { name: 'github', status: 'connected' },
        {
          name: 'kubernetes',
          status: connecting ? 'sso_pending' : 'connected',
          token_forwarding_enabled: true,
        },
        { name: 'web-search', status: 'connected' },
      ],
    }));
    await renderPanel();

    const kubernetes = rowOf('kubernetes');
    expect(
      await within(kubernetes).findByText('Connecting'),
    ).toBeInTheDocument();
    expect(
      within(kubernetes).queryByText('Sign in needed'),
    ).not.toBeInTheDocument();

    connecting = false;
    expect(
      await within(kubernetes).findByText('Connected', undefined, {
        timeout: 5_000,
      }),
    ).toBeInTheDocument();
  });

  it('says a connected SSO connector is connected, whatever failure muster kept from another session', async () => {
    api.getAuthStatus.mockImplementation(async () => ({
      servers: [
        { name: 'github', status: 'connected' },
        {
          name: 'kubernetes',
          status: 'connected',
          token_forwarding_enabled: true,
          sso_attempt_failed: true,
        },
        { name: 'web-search', status: 'connected' },
      ],
    }));
    await renderPanel();

    const kubernetes = rowOf('kubernetes');
    await waitFor(() =>
      expect(within(rowOf('github')).queryByText('Sign in needed')).toBeNull(),
    );
    expect(within(kubernetes).getByText('Connected')).toBeInTheDocument();
    expect(within(kubernetes).queryByText('Cannot connect')).toBeNull();
    expect(within(kubernetes).queryByText('Could not sign in')).toBeNull();
  });

  it('says "Signing in…" while the sign-in page is open, the wait in a tooltip', async () => {
    api.signInServer.mockResolvedValueOnce({
      status: 'auth_required',
      authUrl: 'https://github.example.test/login/oauth/authorize',
      message: 'Sign in to github.',
      clientIdMethod: 'dcr',
    } as never);
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );

    expect(await within(github).findByText('Signing in…')).toBeInTheDocument();
    expect(consentOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://github.example.test/login/oauth/authorize',
      }),
    );
    expect(
      await within(github).findByRole('button', {
        name: 'Reopen sign-in page',
      }),
    ).toBeInTheDocument();
    expect(
      within(github).queryByText('Waiting for you to finish signing in…'),
    ).toBeNull();
    expect(
      within(github).queryByText(/Dynamic Client Registration/),
    ).toBeNull();

    // react-aria opens a tooltip on hover only once it has seen a pointer
    // move, and a hover's own move lands after its enter.
    await user.hover(document.body);
    await user.hover(
      within(github).getByRole('button', {
        name: 'About the state of github',
      }),
    );
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Waiting for you to finish signing in…');
    expect(tooltip).toHaveTextContent(/Dynamic Client Registration/);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('offers the sign-in page again when the person did not open it', async () => {
    consentOpen.mockResolvedValueOnce('decline');
    api.signInServer.mockResolvedValueOnce({
      status: 'auth_required',
      authUrl: 'https://github.example.test/login/oauth/authorize',
      message: 'Sign in to github.',
    } as never);
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );
    await user.click(
      await within(github).findByRole('button', {
        name: 'Open sign-in page (opens in a new tab)',
      }),
    );

    expect(consentOpen).toHaveBeenCalledTimes(2);
    expect(consentOpen).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: 'https://github.example.test/login/oauth/authorize',
      }),
    );
    expect(
      await within(github).findByRole('button', {
        name: 'Reopen sign-in page',
      }),
    ).toBeInTheDocument();
  });

  it("names a refused sign-in in a few words, muster's reason in a tooltip", async () => {
    api.signInServer.mockResolvedValueOnce({
      status: 'error',
      message: 'Too many sign-in attempts; try again in a minute.',
    } as never);
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );

    expect(
      await within(github).findByText('Could not sign in'),
    ).toBeInTheDocument();
    expect(within(github).queryByText(/Too many sign-in attempts/)).toBeNull();
    // react-aria opens a tooltip on hover only once it has seen a pointer
    // move, and a hover's own move lands after its enter.
    await user.hover(document.body);
    await user.hover(
      within(github).getByRole('button', {
        name: 'About the state of github',
      }),
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'Too many sign-in attempts; try again in a minute.',
    );
    // The sign-in stays on offer: a refusal is not the end of it.
    expect(
      within(github).getByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
  });

  it('names an error during a sign-in over "Signing in…": a refused reopen', async () => {
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );
    expect(await within(github).findByText('Signing in…')).toBeInTheDocument();

    api.signInServer.mockResolvedValueOnce({
      status: 'error',
      message: 'Too many sign-in attempts; try again in a minute.',
    } as never);
    await user.click(
      within(github).getByRole('button', { name: 'Reopen sign-in page' }),
    );

    expect(
      await within(github).findByText('Could not sign in'),
    ).toBeInTheDocument();
    expect(within(github).queryByText('Signing in…')).toBeNull();
    // The wait goes on: the tab opened earlier may still complete it.
    expect(
      within(github).getByRole('button', { name: 'Reopen sign-in page' }),
    ).toBeInTheDocument();
  });

  it('warns while signing in when the sign-in may be rejected as an unregistered client', async () => {
    api.signInServer.mockResolvedValueOnce({
      status: 'auth_required',
      authUrl: 'https://github.example.test/login/oauth/authorize',
      message: 'Sign in to github.',
      clientIdMethod: 'cimd-fallback',
    } as never);
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );

    const label = await within(github).findByText('Signing in…');
    expect(label.parentElement?.querySelector('[data-tone]')).toHaveAttribute(
      'data-tone',
      'warning',
    );
  });

  it('never says "Signing in…" for a connector muster turns out to manage through SSO', async () => {
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );
    expect(await within(github).findByText('Signing in…')).toBeInTheDocument();

    api.getAuthStatus.mockImplementation(async () => ({
      servers: [
        {
          name: 'github',
          status: 'auth_required',
          token_exchange_enabled: true,
        },
        { name: 'kubernetes', status: 'connected' },
        { name: 'web-search', status: 'connected' },
      ],
    }));
    await act(() =>
      queryClient.invalidateQueries({ queryKey: ['muster', 'auth-status'] }),
    );

    // Not a sign-in either: nothing waits on this person.
    await waitFor(() =>
      expect(within(github).queryByText('Signing in…')).toBeNull(),
    );
    expect(within(github).queryByText('Sign in needed')).toBeNull();
    expect(
      within(github).queryByRole('button', { name: /sign-in page/ }),
    ).not.toBeInTheDocument();
  });

  it('opens the connector from a plain state, which has nothing to press', async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.click(await within(rowOf('kubernetes')).findByText('Connected'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/customize/connectors/gazelle/kubernetes',
      undefined,
    );
  });

  it('withholds the sign-in of a deactivated connector, saying why', async () => {
    mockServers = [
      makeServer('github', {
        auth: { type: 'oauth' },
        state: 'Stopped',
        suspended: true,
      }),
    ];
    await renderPanel();

    // The list redraws once muster's sign-in report arrives.
    await screen.findByRole('button', { name: 'Sign in' });
    const github = rowOf('github');
    expect(within(github).getByText('Deactivated')).toBeInTheDocument();
    expect(
      await within(github).findByRole('button', { name: 'Sign in' }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        'Deactivated connectors cannot be signed in to; activate the connector first.',
      ),
    ).toBeInTheDocument();
  });

  it('says "Status unavailable", not a failed sign-in, when the status cannot be read during one', async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.click(
      await within(rowOf('github')).findByRole('button', { name: 'Sign in' }),
    );
    expect(
      await within(rowOf('github')).findByText('Signing in…'),
    ).toBeInTheDocument();

    api.getAuthStatus.mockImplementation(async () => {
      throw new Error('muster answered 502');
    });
    await act(() =>
      queryClient.invalidateQueries({ queryKey: ['muster', 'auth-status'] }),
    );

    const github = rowOf('github');
    expect(
      await within(github).findByText('Status unavailable'),
    ).toBeInTheDocument();
    expect(within(github).queryByText('Could not sign in')).toBeNull();
    // The sign-in is still going: its way back into the page stays.
    const reopen = within(github).getByRole('button', {
      name: 'Reopen sign-in page',
    });

    // A refused reopen outranks the unreadable status in the label; the
    // tooltip keeps both.
    api.signInServer.mockResolvedValueOnce({
      status: 'error',
      message: 'Too many sign-in attempts; try again in a minute.',
    } as never);
    await user.click(reopen);
    expect(
      await within(github).findByText('Could not sign in'),
    ).toBeInTheDocument();
    // react-aria opens a tooltip on hover only once it has seen a pointer
    // move, and a hover's own move lands after its enter.
    await user.hover(document.body);
    await user.hover(
      within(github).getByRole('button', {
        name: 'About the state of github',
      }),
    );
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Too many sign-in attempts');
    expect(tooltip).toHaveTextContent(
      'Cannot read the Muster auth status: muster answered 502',
    );
  });

  it('offers no sign-in without a muster session', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
    expect(api.getAuthStatus).not.toHaveBeenCalled();
  });

  it('says how to add a connector while none is registered, above the platform’s own', async () => {
    mockServers = [
      makeServer('agent-manager', { toolGroup: 'agent-platform' }),
      makeServer('kubernetes', { toolGroup: 'infrastructure' }),
    ];
    await renderPanel();

    expect(
      await screen.findByText('No connectors added yet'),
    ).toBeInTheDocument();
    expect(rowOf('kubernetes')).toBeVisible();
  });

  it('leaves the prompt out once a connector is registered, or while searching', async () => {
    mockServers = [makeServer('kubernetes', { toolGroup: 'infrastructure' })];
    const { unmount } = await renderPanel('kube');
    await screen.findByRole('row', { name: /^kubernetes/ });
    expect(screen.queryByText('No connectors added yet')).toBeNull();
    unmount();

    mockServers = [
      makeServer('jira'),
      makeServer('kubernetes', { toolGroup: 'infrastructure' }),
    ];
    await renderPanel();
    await screen.findByRole('row', { name: /^jira/ });
    expect(screen.queryByText('No connectors added yet')).toBeNull();
  });

  it('opens the connector page from its row', async () => {
    await renderPanel();

    expect(rowOf('kubernetes')).toHaveAttribute(
      'data-href',
      '/customize/connectors/gazelle/kubernetes',
    );
    // The name is a real link too (M21): keyboard, new tab.
    expect(
      within(rowOf('kubernetes')).getByRole('link', { name: 'kubernetes' }),
    ).toHaveAttribute('href', '/customize/connectors/gazelle/kubernetes');
  });

  it('names a connector by its display name, linking by its name', async () => {
    mockServers = [
      makeServer('mcp-websearch', { displayName: 'Web search' }),
      makeServer('github'),
    ];
    await renderPanel();

    expect(
      within(rowOf('Web search')).getByRole('link', { name: 'Web search' }),
    ).toHaveAttribute('href', '/customize/connectors/gazelle/mcp-websearch');
    expect(screen.queryByText('mcp-websearch')).not.toBeInTheDocument();
  });

  it('finds a connector by its display name and by its name', async () => {
    mockServers = [
      makeServer('mcp-websearch', { displayName: 'Web search' }),
      makeServer('github'),
    ];
    const { unmount } = await renderPanel('web s');
    expect(await screen.findByText('Web search')).toBeInTheDocument();
    expect(screen.queryByText('github')).not.toBeInTheDocument();
    unmount();

    await renderPanel('mcp-web');
    expect(await screen.findByText('Web search')).toBeInTheDocument();
  });

  it('names two connectors with the same display name by their own names', async () => {
    mockServers = [
      makeServer('github-org-a', { displayName: 'GitHub' }),
      makeServer('github-org-b', { displayName: 'GitHub' }),
    ];
    await renderPanel();

    expect(
      await screen.findByRole('link', { name: 'github-org-a' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'github-org-b' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('GitHub')).not.toBeInTheDocument();
  });

  it('searches connectors by their tools too', async () => {
    await renderPanel('pods');

    expect(await screen.findByText('1 of 1 tools match')).toBeInTheDocument();
    expect(screen.queryByText('github')).not.toBeInTheDocument();
    // The row opens its Tools tab on the same search.
    expect(rowOf('kubernetes')).toHaveAttribute(
      'data-href',
      '/customize/connectors/gazelle/kubernetes?q=pods',
    );
  });

  it('opens a row its name matched without the search', async () => {
    await renderPanel('kube');

    await screen.findByText('1 tool');
    expect(rowOf('kubernetes')).toHaveAttribute(
      'data-href',
      '/customize/connectors/gazelle/kubernetes',
    );
  });

  it('names the connectors whose tools a search that found nothing could not see', async () => {
    mockServers = [
      ...servers().filter(server => server.getName() !== 'web-search'),
      makeServer('web-search', { state: 'Failed' }),
    ];
    // muster lists no tools of a connector waiting on a sign-in.
    api.filterTools.mockImplementationOnce(async () => ({
      total: 1,
      filtered_count: 1,
      truncated: false,
      tools: [{ name: 'x_kubernetes_get_pods', description: 'List pods' }],
    }));
    await renderPanel('issue');

    expect(await screen.findByText(/need your sign-in/)).toHaveTextContent(
      'The tools of github were not searched: they need your sign-in. The tools of web-search were not searched: they could not be read.',
    );
    expect(
      screen.getByText('No connectors or tools match “issue”.'),
    ).toBeInTheDocument();
  });

  it('says a search that found nothing covered names only while the tools load', async () => {
    api.filterTools.mockImplementationOnce(() => new Promise(() => {}));
    await renderPanel('pods');

    expect(
      await screen.findByText('No connectors match “pods”.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Only connector names were searched: the tools are still loading.',
      ),
    ).toBeInTheDocument();
  });

  it('leaves a failed tool read to the alert when a search finds nothing', async () => {
    api.filterTools.mockImplementationOnce(async () => {
      throw new Error('muster answered 502');
    });
    await renderPanel('pods');

    expect(
      await screen.findByText('No connectors match “pods”.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the search covers connector names only/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/were not searched/)).not.toBeInTheDocument();
  });

  it('says the tools are loading while the muster session opens', async () => {
    mockAuthenticated = false;
    mockSessionPending = true;
    await renderPanel('pods');

    expect(
      await screen.findByText(
        'Only connector names were searched: the tools are still loading.',
      ),
    ).toBeInTheDocument();
  });

  it('names every connector without tools while sign-ins are not known yet', async () => {
    // Its own state says nothing of this person's sign-in.
    mockServers = [
      makeServer('github', { auth: { type: 'oauth' } }),
      ...servers().filter(server => server.getName() !== 'github'),
    ];
    api.getAuthStatus.mockImplementation(() => new Promise(() => {}));
    api.filterTools.mockImplementationOnce(async () => ({
      total: 1,
      filtered_count: 1,
      truncated: false,
      tools: [{ name: 'x_kubernetes_get_pods', description: 'List pods' }],
    }));
    await renderPanel('issue');

    expect(
      await screen.findByText(
        'The tools of 2 connectors (github, web-search) were not searched: Muster listed none of them.',
      ),
    ).toBeInTheDocument();
  });

  it('says a cut-off tool list was not searched in full', async () => {
    api.filterTools.mockImplementationOnce(async () => ({
      total: 2500,
      filtered_count: 2500,
      truncated: true,
      tools: [{ name: 'x_kubernetes_get_pods', description: 'List pods' }],
    }));
    await renderPanel('issue');

    expect(
      await screen.findByText(/Some tools were not searched/),
    ).toHaveTextContent(
      'Some tools were not searched: Muster returned only part of them. The tools of github were not searched: they need your sign-in.',
    );
  });

  it('says a search that found nothing covered names only without a session', async () => {
    mockAuthenticated = false;
    await renderPanel('pods');

    expect(
      await screen.findByText(
        'Only connector names were searched: tools need a Muster session.',
      ),
    ).toBeInTheDocument();
  });

  it('asks for a muster session before reading tools', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(
      screen.getByText(/Tool counts and sign-ins need a Muster session/),
    ).toBeInTheDocument();
    expect(api.filterTools).not.toHaveBeenCalled();
  });

  it('says when no environment runs muster', async () => {
    mockInstance = { activeInstallation: undefined };
    await renderPanel();

    expect(screen.getByText('No connectors here')).toBeInTheDocument();
  });

  it('does not claim no muster runs once the portal session ended', async () => {
    mockInstance = { activeInstallation: undefined };
    mainSessionEnd.reason.mockReturnValue('signed-in-elsewhere');
    try {
      await renderPanel();

      expect(
        screen.getByText('Could not read your connectors'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Your session in this browser ended. Sign in again to see them.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText('No connectors here')).not.toBeInTheDocument();
    } finally {
      mainSessionEnd.reason.mockReturnValue(undefined);
    }
  });

  describe('at list scale', () => {
    const manyServers = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        makeServer(`connector-${String(i).padStart(3, '0')}`),
      );
    const bodyRows = () => screen.getAllByRole('row').slice(1);

    it('draws three connectors with no paging chrome', async () => {
      await renderPanel();

      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      // And muster itself.
      expect(bodyRows()).toHaveLength(4);
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
      // bui's page-mode footer.
      expect(screen.queryByText(/of 3/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /next/i }),
      ).not.toBeInTheDocument();
    });

    it('draws all 60 connectors at once, by name, with no "Show more"', async () => {
      mockServers = manyServers(60).reverse();
      await renderPanel();

      // And muster itself.
      expect(bodyRows()).toHaveLength(61);
      expect(
        within(bodyRows()[0]).getByText('connector-000'),
      ).toBeInTheDocument();
      expect(
        within(bodyRows()[59]).getByText('connector-059'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more|fewer/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
    });

    it('draws every match of a search of 60 connectors', async () => {
      mockServers = manyServers(60);
      await renderPanel('connector-0');

      expect(bodyRows()).toHaveLength(60);
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe('order', () => {
    const names = () =>
      screen
        .getAllByRole('rowheader')
        .map(cell => within(cell).getByRole('link').textContent);
    const header = (name: string) =>
      screen.getByRole('columnheader', { name: new RegExp(`^${name}`) });

    it('lists the connectors by display name, else by name, whatever the case', async () => {
      mockServers = [
        makeServer('z-crm', { displayName: 'Charlie' }),
        makeServer('alpha'),
        makeServer('y-search', { displayName: 'beta' }),
        makeServer('acme', { displayName: 'MUSTER' }),
        makeServer('delta', { toolGroup: 'infrastructure' }),
      ];
      await renderPanel();

      expect(names()).toEqual([
        'alpha',
        'beta',
        'Charlie',
        'delta',
        // Case aside, a tie with Muster's own row: the name breaks it, acme
        // before muster.
        'MUSTER',
        'Muster',
      ]);
    });

    it('sorts by a header click, and reverses on a second one', async () => {
      const user = userEvent.setup();
      await renderPanel();
      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      expect(names()).toEqual(['github', 'kubernetes', 'Muster', 'web-search']);

      await user.click(header('Connector'));
      expect(names()).toEqual(['web-search', 'Muster', 'kubernetes', 'github']);
      await user.click(header('Connector'));
      expect(names()).toEqual(['github', 'kubernetes', 'Muster', 'web-search']);

      await user.click(header('Tools'));
      // muster's tools are its own core tools: none in this catalogue. The
      // name breaks the ties.
      expect(names()).toEqual(['Muster', 'web-search', 'kubernetes', 'github']);
      await user.click(header('Tools'));
      expect(names()).toEqual(['github', 'kubernetes', 'Muster', 'web-search']);
    });

    it('sorts by sign-in', async () => {
      const user = userEvent.setup();
      await renderPanel();
      expect(
        await within(rowOf('github')).findByText('Sign in needed'),
      ).toBeInTheDocument();

      await user.click(header('Sign-in'));
      const auths = () =>
        screen
          .getAllByRole('row')
          .slice(1)
          .map(row => within(row).getAllByRole('gridcell')[1].textContent);
      expect(auths()).toEqual([...auths()].sort((a, b) => a.localeCompare(b)));
    });

    it('sorts by state, the most urgent first, and reverses it', async () => {
      const user = userEvent.setup();
      mockServers = [...servers(), makeServer('broken', { state: 'Failed' })];
      await renderPanel();
      expect(
        await within(rowOf('github')).findByText('Sign in needed'),
      ).toBeInTheDocument();
      expect(
        within(rowOf('Muster')).getByText('Connected'),
      ).toBeInTheDocument();

      // The sign-in this person can give, then the failure, then the healthy,
      // each tier by name.
      await user.click(header('Status'));
      expect(names()).toEqual([
        'github',
        'broken',
        'kubernetes',
        'Muster',
        'web-search',
      ]);
      await user.click(header('Status'));
      expect(names()).toEqual([
        'kubernetes',
        'Muster',
        'web-search',
        'broken',
        'github',
      ]);
    });

    it('keeps the sort through a search', async () => {
      const user = userEvent.setup();
      // The search box is the Customize screen's; a stand-in feeds the panel.
      function Searched() {
        const [search, setSearch] = useState('');
        return (
          <>
            <input
              aria-label="Search"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
            <CustomizeConnectorsPanel search={search} />
          </>
        );
      }
      await renderInPanelApp(<Searched />);
      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      await user.click(header('Connector'));
      expect(names()).toEqual(['web-search', 'Muster', 'kubernetes', 'github']);

      await user.type(screen.getByRole('textbox', { name: 'Search' }), 'u');
      expect(names()).toEqual(['Muster', 'kubernetes', 'github']);
    });
  });

  describe('filters (T49, T64)', () => {
    const bodyRows = () => screen.getAllByRole('row').slice(1);
    /** A filter's dropdown; `hidden` keeps it readable while it is open. */
    const filterDropdown = (field: string) =>
      screen.getByRole('button', {
        name: new RegExp(`Filter by ${field}`),
        hidden: true,
      });
    /** A filter dropdown's options, as "label count", read and closed. */
    const filterOptions = async (field: string) => {
      await userEvent.click(filterDropdown(field));
      const options = within(await screen.findByRole('listbox'))
        .getAllByRole('option')
        .map(option => option.textContent);
      await userEvent.keyboard('{Escape}');
      return options;
    };
    /** Toggles one option of a filter dropdown. */
    const pickFilter = async (field: string, option: string) => {
      await userEvent.click(filterDropdown(field));
      await userEvent.click(
        await screen.findByRole('option', { name: option }),
      );
      await userEvent.keyboard('{Escape}');
    };

    it('names only the connectors the filters keep', async () => {
      api.filterTools.mockImplementationOnce(async () => ({
        total: 1,
        filtered_count: 1,
        truncated: false,
        tools: [{ name: 'x_kubernetes_get_pods', description: 'List pods' }],
      }));
      await renderPanel('issue');

      await screen.findByText(/need your sign-in/);
      await pickFilter('connection', 'Connected 0');
      expect(
        screen.getByText(
          'No connectors or tools match “issue” with these filters.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByText(/were not searched/)).not.toBeInTheDocument();
    });

    it('offers no connection filter over connectors that all answer', async () => {
      mockServers = ['a', 'b', 'c'].map(name => makeServer(name));
      await renderPanel();

      await waitFor(() => expect(api.getAuthStatus).toHaveBeenCalled());
      // And muster itself.
      expect(bodyRows()).toHaveLength(4);
      // muster signs in with the company login, the rest with none.
      await screen.findByRole('button', { name: /Filter by sign-in/ });
      expect(await filterOptions('sign-in')).toEqual([
        'No sign-in 3',
        'Company login 1',
      ]);
      // One connection state for all: nothing to choose.
      expect(
        screen.queryByRole('button', { name: /Filter by connection/ }),
      ).not.toBeInTheDocument();
    });

    it('filters three connectors by sign-in and by connection', async () => {
      await renderPanel();

      await screen.findByRole('button', { name: /Filter by connection/ });
      // muster itself signs in with the company login and answers.
      expect(await filterOptions('sign-in')).toEqual([
        'Company login 2',
        'No sign-in 1',
        'Your own account 1',
      ]);
      expect(await filterOptions('connection')).toEqual([
        'Connected 3',
        'Sign-in needed 1',
      ]);

      await pickFilter('connection', 'Sign-in needed 1');
      expect(bodyRows()).toHaveLength(1);
      expect(rowOf('github')).toBeInTheDocument();

      await pickFilter('connection', 'Sign-in needed 1');
      await pickFilter('sign-in', 'No sign-in 1');
      expect(bodyRows()).toHaveLength(1);
      expect(rowOf('web-search')).toBeInTheDocument();
      // A second sign-in kind widens the list.
      await pickFilter('sign-in', 'Your own account 1');
      expect(bodyRows()).toHaveLength(2);
    });

    it('keeps the sort a header click chose through a filter', async () => {
      await renderPanel();
      await screen.findByRole('button', { name: /Filter by connection/ });
      await userEvent.click(
        screen.getByRole('columnheader', { name: /^Connector/ }),
      );
      const names = () =>
        screen
          .getAllByRole('rowheader')
          .map(cell => within(cell).getByRole('link').textContent);
      expect(names()).toEqual(['web-search', 'Muster', 'kubernetes', 'github']);

      await pickFilter('connection', 'Connected 3');
      expect(names()).toEqual(['web-search', 'Muster', 'kubernetes']);
    });

    it('filters by tags, after the type’s own facets, and searches them', async () => {
      mockServers = [
        makeServer('jira', { tags: 'ticketing,ops,support,triage' }),
        makeServer('pagerduty', { tags: 'ops' }),
        makeServer('web-search'),
      ];
      await renderPanel();

      // All answer, so no connection filter; muster's company login makes
      // the sign-in one.
      await screen.findByRole('button', { name: /Filter by sign-in/ });
      expect(
        filterDropdown('sign-in').compareDocumentPosition(
          filterDropdown('tags'),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // A row shows three tags, then "+N".
      const jira = within(rowOf('jira')).getByRole('list', { name: 'Tags' });
      expect(within(jira).getAllByRole('listitem')).toHaveLength(4);
      expect(within(jira).getByText('1 more tags')).toBeInTheDocument();

      await pickFilter('tags', 'ops 2');
      expect(bodyRows()).toHaveLength(2);
      expect(screen.queryByRole('row', { name: /^web-search/ })).toBeNull();
    });

    it('finds a connector by a tag', async () => {
      mockServers = [
        makeServer('jira', { tags: 'ticketing' }),
        makeServer('web-search'),
      ];
      await renderPanel('ticket');

      expect(await screen.findByRole('row', { name: /^jira/ })).toBeVisible();
      expect(screen.queryByRole('row', { name: /^web-search/ })).toBeNull();
    });

    it('says when a search and a filter leave nothing, and clears the filter', async () => {
      await renderPanel('github');

      await screen.findByRole('button', { name: /Filter by sign-in/ });
      await pickFilter('sign-in', 'No sign-in 0');
      expect(
        screen.getByText(
          'No connectors or tools match “github” with these filters.',
        ),
      ).toBeInTheDocument();
      // The empty state's way back (the bar offers the same).
      const [, emptyStateClear] = screen.getAllByRole('button', {
        name: 'Clear filters',
      });
      await userEvent.click(emptyStateClear);
      expect(rowOf('github')).toBeInTheDocument();
    });

    // 30 rows and a dozen menu round trips render far more than any other
    // case here; on a loaded CI runner that outgrows jest's 5 s default.
    it('filters 30 connectors, drawing every one the filters keep', async () => {
      mockServers = Array.from({ length: 30 }, (_, i) =>
        makeServer(`connector-${String(i).padStart(3, '0')}`, {
          ...(i % 3 === 0 ? { auth: { type: 'oauth' } } : {}),
          ...(i % 5 === 0 ? { state: 'Failed' as MCPServerState } : {}),
        }),
      );
      await renderPanel();

      await screen.findByRole('button', { name: /Filter by connection/ });
      expect(await filterOptions('connection')).toEqual([
        'Connected 25',
        'Not connected 6',
      ]);
      expect(await filterOptions('sign-in')).toEqual([
        'No sign-in 20',
        'Your own account 10',
        'Company login 1',
      ]);
      expect(bodyRows()).toHaveLength(31);

      await pickFilter('connection', 'Not connected 6');
      expect(bodyRows()).toHaveLength(6);
      // The sign-in counts follow the connection pick.
      expect(await filterOptions('sign-in')).toEqual([
        'No sign-in 4',
        'Your own account 2',
        'Company login 0',
      ]);

      // Both connection states: everything again; then one sign-in kind.
      await pickFilter('connection', 'Connected 25');
      expect(bodyRows()).toHaveLength(31);
      await pickFilter('sign-in', 'Your own account 10');
      expect(bodyRows()).toHaveLength(10);

      await userEvent.click(
        within(screen.getByRole('group', { name: 'Filters' })).getByRole(
          'button',
          { name: 'Clear filters' },
        ),
      );
      expect(bodyRows()).toHaveLength(31);
    }, 20_000);
  });

  describe('at phone width (T22 B8)', () => {
    let layout: MockedLayout;
    beforeEach(() => {
      layout = mockPhoneLayout();
    });
    afterEach(() => layout.restore());

    const list = () => screen.getByRole('list', { name: 'Connectors' });
    // The rows, not the tag items inside them.
    const items = () =>
      within(list())
        .getAllByRole('listitem')
        .filter(item => item.parentElement === list());
    const itemOf = (name: string) =>
      within(list()).getByRole('link', { name }).closest('li') as HTMLElement;

    it('stacks a row per connector: name and state, then sign-in and tools', async () => {
      await renderPanel();

      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      // No table to squeeze: its columns froze at 75px and clipped Sign in.
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      // And muster itself.
      expect(items()).toHaveLength(4);

      const github = itemOf('github');
      expect(
        within(github).getByRole('link', { name: 'github' }),
      ).toHaveAttribute('href', '/customize/connectors/gazelle/github');
      expect(within(github).getByText('Your own account')).toBeInTheDocument();
      expect(
        within(github).getByText('Repositories and pull requests'),
      ).toBeInTheDocument();
      expect(
        await within(github).findByText('Sign in needed'),
      ).toBeInTheDocument();

      const kubernetes = itemOf('kubernetes');
      expect(within(kubernetes).getByText('Company login')).toBeInTheDocument();
      expect(within(kubernetes).getByText('1 tool')).toBeInTheDocument();
      expect(within(kubernetes).getByText('Connected')).toBeInTheDocument();
      expect(
        within(kubernetes).queryByRole('button', { name: 'Sign in' }),
      ).not.toBeInTheDocument();
    });

    it("signs in from the row, the button outside the row's link", async () => {
      await renderPanel();

      // A row with a sign-in is redrawn once muster's report arrives.
      await screen.findByText('Sign in needed');
      const github = itemOf('github');
      const signIn = await within(github).findByRole('button', {
        name: 'Sign in',
      });
      expect(
        within(github).getByRole('link', { name: 'github' }),
      ).not.toContainElement(signIn);
      await userEvent.click(signIn);

      await waitFor(() =>
        expect(api.signInServer).toHaveBeenCalledWith('github', 'gazelle'),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('keeps a refused SSO sign-in to its state on line 1, the reason in a hint', async () => {
      api.getAuthStatus.mockImplementation(async () => ssoFailedAuthStatus());
      await renderPanel();

      await screen.findByText('Cannot connect');
      const kubernetes = itemOf('kubernetes');
      expect(
        within(kubernetes).getByText('Cannot connect'),
      ).toBeInTheDocument();
      expect(within(kubernetes).queryByText(SSO_REFUSED)).toBeNull();
      // No sign-in, so no actions slot: just the tile and the body.
      expect(kubernetes.children).toHaveLength(2);
      const hint = within(kubernetes).getByRole('button', {
        name: 'About the state of kubernetes',
      });
      expect(
        within(kubernetes).getByRole('link', { name: 'kubernetes' }),
      ).not.toContainElement(hint);
    });

    it("puts the sign-in in the row's actions, and its answer in the state", async () => {
      api.signInServer.mockResolvedValueOnce({
        status: 'error',
        message: 'Too many sign-in attempts; try again in a minute.',
      } as never);
      await renderPanel();

      // A row with a sign-in is redrawn once muster's report arrives.
      await screen.findByText('Sign in needed');
      const github = itemOf('github');
      const signIn = await within(github).findByRole('button', {
        name: 'Sign in',
      });
      // The actions slot, at the end of line 1, not the status beside the name.
      expect(signIn.closest('li > div')).toBe(github.lastElementChild);

      await userEvent.click(signIn);
      expect(
        await within(github).findByText('Could not sign in'),
      ).toBeInTheDocument();
    });

    it('gives an outstanding sign-in a line of its own, so the name keeps its width', async () => {
      await renderPanel();

      await screen.findByText('Sign in needed');
      await userEvent.click(
        within(itemOf('github')).getByRole('button', { name: 'Sign in' }),
      );

      const github = itemOf('github');
      const reopen = await within(github).findByRole('button', {
        name: 'Reopen sign-in page',
      });
      expect(within(github).getByText('Signing in…')).toBeInTheDocument();
      // Under the description, not in the actions at the end of line 1.
      expect(
        within(github).getByText('Repositories and pull requests')
          .parentElement,
      ).toContainElement(reopen);
    });

    it('keeps the table on a wide viewport', async () => {
      layout.restore();
      layout = mockDesktopLayout();
      await renderPanel();

      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      expect(
        screen.queryByRole('list', { name: 'Connectors' }),
      ).not.toBeInTheDocument();
      expect(rowOf('github')).toBeInTheDocument();
    });

    it('draws three connectors with no paging chrome', async () => {
      await renderPanel();

      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      // And muster itself.
      expect(items()).toHaveLength(4);
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more|fewer/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
    });

    it('stacks all 60 connectors at once, by name', async () => {
      mockServers = Array.from({ length: 60 }, (_, i) =>
        makeServer(`connector-${String(i).padStart(3, '0')}`),
      ).reverse();
      await renderPanel();

      // And muster itself.
      expect(items()).toHaveLength(61);
      expect(within(items()[0]).getByText('connector-000')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more/ }),
      ).not.toBeInTheDocument();
    });

    it('narrows the stacked rows with the filters', async () => {
      await renderPanel();

      await userEvent.click(
        await screen.findByRole('button', {
          name: /Filter by connection/,
          hidden: true,
        }),
      );
      await userEvent.click(
        await screen.findByRole('option', { name: 'Sign-in needed 1' }),
      );
      await userEvent.keyboard('{Escape}');

      expect(items()).toHaveLength(1);
      expect(itemOf('github')).toBeInTheDocument();
    });
  });

  it('lists muster alone when muster has no other connector', async () => {
    mockServers = [];
    await renderPanel();

    expect(rowOf('Muster')).toBeInTheDocument();
  });

  describe('one list, tagged by tool group', () => {
    const fleet = () => [
      ...servers(),
      makeServer('agent-manager', {
        toolGroup: 'agent-platform',
        description: 'Manages agents',
      }),
      makeServer('a-prometheus', {
        toolGroup: 'infrastructure',
        family: 'prometheus',
      }),
      makeServer('b-prometheus', {
        toolGroup: 'infrastructure',
        family: 'prometheus',
      }),
      makeServer('lone-capi', { toolGroup: 'infrastructure' }),
      // The customer's own family: no label.
      makeServer('a-crm', { family: 'crm' }),
      makeServer('b-crm', { family: 'crm' }),
    ];

    beforeEach(() => {
      mockServers = fleet();
    });

    it('lists every connector by name, the platform’s own among the rest', async () => {
      await renderPanel();
      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      const names = screen
        .getAllByRole('rowheader')
        .map(cell => within(cell).getByRole('link').textContent);
      expect(names).toEqual([
        'agent-manager',
        'crm',
        'github',
        'kubernetes',
        'lone-capi',
        'Muster',
        'prometheus',
        'web-search',
      ]);
    });

    it('tags the platform’s own connectors by their tool group', async () => {
      await renderPanel();
      expect(
        within(rowOf('prometheus')).getByText('infrastructure'),
      ).toBeInTheDocument();
      expect(
        within(rowOf('lone-capi')).getByText('infrastructure'),
      ).toBeInTheDocument();
      expect(
        within(rowOf('agent-manager')).getByText('agent-platform'),
      ).toBeInTheDocument();
      expect(
        within(rowOf('Muster')).getByText('agent-platform'),
      ).toBeInTheDocument();
    });

    it('finds the platform’s own connectors by their derived tag', async () => {
      await renderPanel('infrastructure');
      expect(rowOf('prometheus')).toBeInTheDocument();
      expect(rowOf('lone-capi')).toBeInTheDocument();
      expect(
        screen.queryByRole('row', { name: /^github/ }),
      ).not.toBeInTheDocument();
    });

    it('lists muster among the internal servers, without its endpoint', async () => {
      mockInstance = {
        activeInstallationInfo: {
          name: 'gazelle',
          requiresAuth: true,
          endpoint: 'https://muster.gazelle.example.test/mcp',
        },
      };
      await renderPanel();

      expect(rowOf('agent-manager')).toBeInTheDocument();
      const muster = rowOf('Muster');
      expect(
        within(muster).queryByText('https://muster.gazelle.example.test/mcp'),
      ).not.toBeInTheDocument();
      expect(
        within(muster).queryByRole('button', { name: 'Copy endpoint' }),
      ).not.toBeInTheDocument();
      expect(within(muster).getByText('Company login')).toBeInTheDocument();
      expect(within(muster).getByText('Connected')).toBeInTheDocument();
      expect(
        within(muster).getByRole('link', { name: 'Muster' }),
      ).toHaveAttribute('href', '/customize/connectors/gazelle/muster');
    });

    it('says an anonymous muster the probe could not reach is not connected', async () => {
      mockInstance = {
        activeInstallationInfo: {
          name: 'gazelle',
          requiresAuth: false,
          reachable: false,
        },
      };
      await renderPanel();
      const muster = rowOf('Muster');
      expect(within(muster).getByText('No sign-in')).toBeInTheDocument();
      expect(within(muster).getByText('Not connected')).toBeInTheDocument();
      expect(within(muster).queryByText('Connected')).not.toBeInTheDocument();
    });

    it('claims no state for muster while its installation is undescribed', async () => {
      mockInstance = { activeInstallationInfo: undefined };
      await renderPanel();
      const muster = rowOf('Muster');
      expect(within(muster).queryByText('Connected')).not.toBeInTheDocument();
      expect(within(muster).queryByText('No sign-in')).not.toBeInTheDocument();
    });

    it('says Muster is not connected without a session', async () => {
      mockAuthenticated = false;
      await renderPanel();
      expect(
        within(rowOf('Muster')).getByText('Not connected'),
      ).toBeInTheDocument();
    });

    describe("muster's logo", () => {
      const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
      let restoreImage: () => void;
      beforeEach(() => {
        restoreImage = stubImageLoad();
      });
      afterEach(() => restoreImage());

      it('shows the icon muster announces, as an image', async () => {
        api.getServerInfo.mockImplementation(async () => ({ icon: SVG }));
        await renderPanel();

        await waitFor(() =>
          expect(rowOf('Muster').querySelector('img')).toHaveAttribute(
            'src',
            SVG,
          ),
        );
        expect(api.getServerInfo).toHaveBeenCalledWith('gazelle');
        expect(rowOf('Muster').querySelector('svg')).toBeNull();
      });

      it('shows the letter tile when muster announces no icon', async () => {
        await renderPanel();

        await waitFor(() => expect(api.getServerInfo).toHaveBeenCalled());
        const muster = rowOf('Muster');
        expect(muster.querySelector('img')).toBeNull();
        expect(
          within(within(muster).getByRole('rowheader')).getByText('M'),
        ).toBeInTheDocument();
      });

      it('shows the letter tile for an icon it would not render', async () => {
        api.getServerInfo.mockImplementation(async () => ({
          icon: ['javascript', 'alert(1)'].join(':'),
        }));
        await renderPanel();

        await waitFor(() => expect(api.getServerInfo).toHaveBeenCalled());
        expect(rowOf('Muster').querySelector('img')).toBeNull();
      });

      it('does not ask muster without a session', async () => {
        mockAuthenticated = false;
        await renderPanel();
        expect(rowOf('Muster').querySelector('img')).toBeNull();
        expect(api.getServerInfo).not.toHaveBeenCalled();
      });
    });
  });
});
