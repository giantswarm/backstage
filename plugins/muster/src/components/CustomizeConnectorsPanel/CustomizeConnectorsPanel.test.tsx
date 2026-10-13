import type { ReactNode } from 'react';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { musterApiRef } from '../../apis';
import type { AuthStatusResponse } from '../../apis/types';
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
import { MCPServer, MCPServerState, TOOL_GROUP_LABEL } from '../../lib/k8s';
import type { ConnectorGroup } from '../../lib/connectorGroups';
import { CustomizeConnectorsPanel } from './CustomizeConnectorsPanel';

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
    pending: false,
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
  } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
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

/** muster's answer when it failed to connect the SSO connector for this person. */
function ssoFailedAuthStatus(): AuthStatusResponse {
  return {
    servers: [
      { name: 'github', status: 'connected' },
      {
        name: 'kubernetes',
        status: 'auth_required',
        token_forwarding_enabled: true,
        sso_attempt_failed: true,
      },
      { name: 'web-search', status: 'connected' },
    ],
  };
}

/** muster's answer when the SSO connector's sign-in has lapsed. */
function ssoExpiredAuthStatus(): AuthStatusResponse {
  return {
    servers: [
      { name: 'github', status: 'connected' },
      {
        name: 'kubernetes',
        status: 'reauth_required',
        token_forwarding_enabled: true,
      },
      { name: 'web-search', status: 'connected' },
    ],
  };
}

const SSO_EXPLANATION =
  "kubernetes authenticates through SSO from muster's own session, so there is nothing to sign in to here.";

let queryClient: QueryClient;

async function renderPanel(search = '', group?: ConnectorGroup) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  queryClient = client;
  return renderInTestApp(
    <QueryClientProvider client={client}>
      <CustomizeConnectorsPanel search={search} group={group} />
    </QueryClientProvider>,
    {
      apis: [[musterApiRef, api]],
      mountedRoutes: {
        '/agent-platform/connectors': mcpServersRouteRef,
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
    mockAuthenticated = true;
    mockInstance = {};
    api.filterTools.mockClear();
    api.getAuthStatus.mockClear();
    api.getAuthStatus.mockImplementation(async () => defaultAuthStatus());
    api.signInServer.mockClear();
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
    expect(
      screen.queryByRole('row', { name: /^muster/ }),
    ).not.toBeInTheDocument();
  });

  it('signs in from the row without opening the connector', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    await renderPanel();

    const github = rowOf('github');
    await user.click(
      await within(github).findByRole('button', { name: 'Sign in' }),
    );

    await waitFor(() =>
      expect(api.signInServer).toHaveBeenCalledWith('github', 'gazelle'),
    );
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();
    open.mockRestore();

    await user.click(
      within(github).getByText('Repositories and pull requests'),
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/connectors/github?installation=gazelle',
      undefined,
    );
  });

  it('says an SSO sign-in has expired in a few words, the reason in a tooltip', async () => {
    api.getAuthStatus.mockImplementation(async () => ssoExpiredAuthStatus());
    const user = userEvent.setup();
    await renderPanel();

    const kubernetes = rowOf('kubernetes');
    expect(
      await within(kubernetes).findByText('Sign-in expired'),
    ).toBeInTheDocument();
    // The sentence used to fill the cell and push the state out of sight.
    expect(within(kubernetes).queryByText(SSO_EXPLANATION)).toBeNull();
    // Nothing to sign in to: SSO comes from muster's own session.
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
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      SSO_EXPLANATION,
    );
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('says a failed SSO connection in a few words, the paragraph in a tooltip (T104)', async () => {
    api.getAuthStatus.mockImplementation(async () => ssoFailedAuthStatus());
    const user = userEvent.setup();
    await renderPanel();

    const kubernetes = rowOf('kubernetes');
    // Not "Sign in needed": there is nothing to sign in to.
    expect(
      await within(kubernetes).findByText('Could not sign in'),
    ).toBeInTheDocument();
    expect(
      within(kubernetes).queryByText('Sign in needed'),
    ).not.toBeInTheDocument();
    expect(
      within(kubernetes).queryByText(/trusted audiences/),
    ).not.toBeInTheDocument();
    expect(
      within(kubernetes).queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();

    await user.hover(document.body);
    await user.hover(
      within(kubernetes).getByRole('button', {
        name: 'About the state of kubernetes',
      }),
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      `${SSO_EXPLANATION} muster tried and failed to establish it for your session — check the connector's trusted audiences with an administrator.`,
    );
  });

  it('says "Signing in…" while the sign-in page is open, the wait in a tooltip', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue({
      closed: false,
      location: { href: '' },
    } as unknown as Window);
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
    expect(
      within(github).getByRole('button', { name: 'Reopen sign-in page' }),
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
    open.mockRestore();
  });

  it("names a refused sign-in in a few words, muster's reason in a tooltip", async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
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
    open.mockRestore();
  });

  it('names an error during a sign-in over "Signing in…": a refused reopen', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue({
      closed: false,
      location: { href: '' },
    } as unknown as Window);
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
    open.mockRestore();
  });

  it('warns while signing in when the sign-in may be rejected as an unregistered client', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
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
    open.mockRestore();
  });

  it('never says "Signing in…" for a connector muster turns out to manage through SSO', async () => {
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
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

    expect(
      await within(github).findByText('Sign in needed'),
    ).toBeInTheDocument();
    expect(within(github).queryByText('Signing in…')).toBeNull();
    expect(
      within(github).queryByRole('button', { name: /sign-in page/ }),
    ).not.toBeInTheDocument();
    open.mockRestore();
  });

  it('opens the connector from a plain state, which has nothing to press', async () => {
    const user = userEvent.setup();
    await renderPanel();

    await user.click(await within(rowOf('kubernetes')).findByText('Connected'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/connectors/kubernetes?installation=gazelle',
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
    const open = jest.spyOn(window, 'open').mockReturnValue({
      closed: false,
      location: { href: '' },
      close: jest.fn(),
    } as unknown as Window);
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
      'Cannot read the muster auth status: muster answered 502',
    );
    open.mockRestore();
  });

  it('offers no sign-in without a muster session', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(
      screen.queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
    expect(api.getAuthStatus).not.toHaveBeenCalled();
  });

  it('opens the connector page from its row', async () => {
    await renderPanel();

    expect(rowOf('kubernetes')).toHaveAttribute(
      'data-href',
      '/agent-platform/connectors/kubernetes?installation=gazelle',
    );
    // The name is a real link too (M21): keyboard, new tab.
    expect(
      within(rowOf('kubernetes')).getByRole('link', { name: 'kubernetes' }),
    ).toHaveAttribute(
      'href',
      '/agent-platform/connectors/kubernetes?installation=gazelle',
    );
  });

  it('searches connectors by their tools too', async () => {
    await renderPanel('pods');

    expect(await screen.findByText('1 of 1 tools match')).toBeInTheDocument();
    expect(screen.queryByText('github')).not.toBeInTheDocument();
  });

  it('asks for a muster session before reading tools', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(
      screen.getByText(/Tool counts and sign-ins need a muster session/),
    ).toBeInTheDocument();
    expect(api.filterTools).not.toHaveBeenCalled();
  });

  it('says when no environment runs muster', async () => {
    mockInstance = { activeInstallation: undefined };
    await renderPanel();

    expect(screen.getByText('No connectors here')).toBeInTheDocument();
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
      expect(bodyRows()).toHaveLength(3);
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

    it('draws the first 20 of 300 connectors, by name, and pages in the rest', async () => {
      const user = userEvent.setup();
      mockServers = manyServers(300).reverse();
      await renderPanel();

      expect(bodyRows()).toHaveLength(20);
      expect(
        within(bodyRows()[0]).getByText('connector-000'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('20 connectors shown, 280 more'),
      ).toBeInTheDocument();

      await user.click(
        screen.getByRole('button', { name: 'Show 20 more connectors' }),
      );

      expect(bodyRows()).toHaveLength(40);
      expect(
        screen.getByRole('button', { name: 'Show fewer' }),
      ).toBeInTheDocument();
    });

    it('pages a search of 300 connectors too', async () => {
      mockServers = manyServers(300);
      await renderPanel('connector-1');

      // connector-100 .. connector-199
      expect(bodyRows()).toHaveLength(20);
      expect(
        screen.getByText('20 connectors shown, 80 more'),
      ).toBeInTheDocument();
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

    it('offers one-option dropdowns over three connectors that sign in alike and all answer', async () => {
      mockServers = ['a', 'b', 'c'].map(name => makeServer(name));
      await renderPanel();

      await waitFor(() => expect(api.getAuthStatus).toHaveBeenCalled());
      expect(bodyRows()).toHaveLength(3);
      await screen.findByRole('button', { name: /Filter by connection/ });
      expect(await filterOptions('sign-in')).toEqual(['No sign-in 3']);
      expect(await filterOptions('connection')).toEqual(['Connected 3']);
    });

    it('filters three connectors by sign-in and by connection', async () => {
      await renderPanel();

      await screen.findByRole('button', { name: /Filter by connection/ });
      expect(await filterOptions('sign-in')).toEqual([
        'Company login 1',
        'No sign-in 1',
        'Your own account 1',
      ]);
      expect(await filterOptions('connection')).toEqual([
        'Connected 2',
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

    it('filters 300 connectors, paging the result from its first page', async () => {
      mockServers = Array.from({ length: 300 }, (_, i) =>
        makeServer(`connector-${String(i).padStart(3, '0')}`, {
          ...(i % 3 === 0 ? { auth: { type: 'oauth' } } : {}),
          ...(i % 5 === 0 ? { state: 'Failed' as MCPServerState } : {}),
        }),
      );
      await renderPanel();

      await screen.findByRole('button', { name: /Filter by connection/ });
      expect(await filterOptions('connection')).toEqual([
        'Connected 240',
        'Not connected 60',
      ]);
      expect(await filterOptions('sign-in')).toEqual([
        'No sign-in 200',
        'Your own account 100',
      ]);
      await userEvent.click(
        screen.getByRole('button', { name: 'Show 20 more connectors' }),
      );
      expect(bodyRows()).toHaveLength(40);

      await pickFilter('connection', 'Not connected 60');
      expect(bodyRows()).toHaveLength(20);
      expect(
        screen.getByText('20 connectors shown, 40 more'),
      ).toBeInTheDocument();
      // The sign-in counts follow the connection pick.
      expect(await filterOptions('sign-in')).toEqual([
        'No sign-in 40',
        'Your own account 20',
      ]);

      // Both connection states: everything again; then one sign-in kind.
      await pickFilter('connection', 'Connected 240');
      expect(
        screen.getByText('20 connectors shown, 280 more'),
      ).toBeInTheDocument();
      await pickFilter('sign-in', 'Your own account 100');
      expect(
        screen.getByText('20 connectors shown, 80 more'),
      ).toBeInTheDocument();

      await userEvent.click(
        within(screen.getByRole('group', { name: 'Filters' })).getByRole(
          'button',
          { name: 'Clear filters' },
        ),
      );
      expect(
        screen.getByText('20 connectors shown, 280 more'),
      ).toBeInTheDocument();
    });
  });

  describe('at phone width (T22 B8)', () => {
    let layout: MockedLayout;
    beforeEach(() => {
      layout = mockPhoneLayout();
    });
    afterEach(() => layout.restore());

    const list = () => screen.getByRole('list', { name: 'Connectors' });
    const items = () => within(list()).getAllByRole('listitem');
    const itemOf = (name: string) =>
      within(list()).getByRole('link', { name }).closest('li') as HTMLElement;

    it('stacks a row per connector: name and state, then sign-in and tools', async () => {
      await renderPanel();

      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      // No table to squeeze: its columns froze at 75px and clipped Sign in.
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      expect(items()).toHaveLength(3);

      const github = itemOf('github');
      expect(
        within(github).getByRole('link', { name: 'github' }),
      ).toHaveAttribute(
        'href',
        '/agent-platform/connectors/github?installation=gazelle',
      );
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
      const open = jest.spyOn(window, 'open').mockReturnValue(null);
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
      open.mockRestore();
    });

    it('keeps an expired SSO sign-in to its state on line 1, the reason in a hint', async () => {
      api.getAuthStatus.mockImplementation(async () => ssoExpiredAuthStatus());
      await renderPanel();

      await screen.findByText('Sign-in expired');
      const kubernetes = itemOf('kubernetes');
      expect(
        within(kubernetes).getByText('Sign-in expired'),
      ).toBeInTheDocument();
      expect(within(kubernetes).queryByText(SSO_EXPLANATION)).toBeNull();
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
      const open = jest.spyOn(window, 'open').mockReturnValue(null);
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
      open.mockRestore();
    });

    it('gives an outstanding sign-in a line of its own, so the name keeps its width', async () => {
      const open = jest.spyOn(window, 'open').mockReturnValue({
        closed: false,
        location: { href: '' },
      } as unknown as Window);
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
      open.mockRestore();
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
      expect(items()).toHaveLength(3);
      expect(
        screen.queryByRole('button', { name: /^Show \d+ more|fewer/ }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
    });

    it('windows 300 connectors by name, a page of stacked rows at a time', async () => {
      mockServers = Array.from({ length: 300 }, (_, i) =>
        makeServer(`connector-${String(i).padStart(3, '0')}`),
      ).reverse();
      await renderPanel();

      expect(items()).toHaveLength(20);
      expect(within(items()[0]).getByText('connector-000')).toBeInTheDocument();
      expect(
        screen.getByText('20 connectors shown, 280 more'),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'Show 20 more connectors' }),
      );
      expect(items()).toHaveLength(40);
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

  it('says when muster has no connector', async () => {
    mockServers = [];
    await renderPanel();

    expect(screen.getByText('No connectors yet')).toBeInTheDocument();
  });

  describe('sub-tabs', () => {
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
    ];

    beforeEach(() => {
      mockServers = fleet();
    });

    it('lists only the customer’s connectors by default', async () => {
      await renderPanel();
      expect(await screen.findByText('2 tools')).toBeInTheDocument();
      for (const name of ['github', 'kubernetes', 'web-search']) {
        expect(rowOf(name)).toBeInTheDocument();
      }
      for (const name of ['agent-manager', 'prometheus', 'muster']) {
        expect(
          screen.queryByRole('row', { name: new RegExp(`^${name}`) }),
        ).not.toBeInTheDocument();
      }
    });

    it('lists the families, one row each, on Families', async () => {
      await renderPanel('', 'families');
      expect(
        screen.getByText(/one connector with an instance per management/),
      ).toBeInTheDocument();
      expect(rowOf('prometheus')).toBeInTheDocument();
      expect(screen.getAllByRole('row')).toHaveLength(2);
    });

    it('lists muster with its endpoint among the internal servers', async () => {
      mockInstance = {
        activeInstallationInfo: {
          name: 'gazelle',
          requiresAuth: true,
          endpoint: 'https://muster.gazelle.example.test/mcp',
        },
      };
      const writeText = jest.fn(async () => undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      const user = userEvent.setup();
      await renderPanel('', 'internal');

      expect(rowOf('agent-manager')).toBeInTheDocument();
      const muster = rowOf('muster');
      expect(
        within(muster).getByText('https://muster.gazelle.example.test/mcp'),
      ).toBeInTheDocument();
      expect(within(muster).getByText('Company login')).toBeInTheDocument();
      expect(within(muster).getByText('Connected')).toBeInTheDocument();
      expect(
        within(muster).getByRole('link', { name: 'muster' }),
      ).toHaveAttribute(
        'href',
        '/agent-platform/connectors/muster?installation=gazelle',
      );

      await user.click(
        within(muster).getByRole('button', { name: 'Copy endpoint' }),
      );
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('says muster is not connected without a session', async () => {
      mockAuthenticated = false;
      await renderPanel('', 'internal');
      expect(
        within(rowOf('muster')).getByText('Not connected'),
      ).toBeInTheDocument();
    });

    it('points a search that finds nothing here to the sub-tabs where it does', async () => {
      await renderPanel('manager');
      expect(
        await screen.findByText(/No connectors or tools match/),
      ).toBeInTheDocument();
      expect(screen.getByText(/The search matches/)).toHaveTextContent(
        'The search matches 1 connector on Internal.',
      );
      expect(screen.getByRole('link', { name: 'Internal' })).toHaveAttribute(
        'href',
        '/customize/connectors/internal',
      );
    });
  });
});
