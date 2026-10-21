import { ReactElement } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  PageHeaderActionsProvider,
  ShellScopeProvider,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { musterApiRef } from '../../apis';
import {
  MANAGEMENT_CLUSTER_LABEL,
  MCPServer,
  TOOL_GROUP_LABEL,
} from '../../lib/k8s';
import {
  customizeExternalRouteRef,
  mcpServersRouteRef,
  usageConnectorsExternalRouteRef,
} from '../../routes';
import { ConnectorPage } from './ConnectorPage';
import { useConnectorPageTarget } from './connectorPageTarget';

jest.mock('@giantswarm/backstage-plugin-flux-react', () => ({
  useGitOpsSource: () => ({ isLoading: false }),
  GitOpsCard: () => null,
}));

let mockServers: MCPServer[] = [];
let mockAuthenticated = true;
let mockLoading = false;
const mockRefresh = jest.fn();
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: true,
    activeInstallationInfo: {
      name: 'gazelle',
      requiresAuth: true,
      endpoint: 'https://muster.gazelle.example.test/mcp',
    },
    mcpServers: mockServers,
    workflows: [],
    isLoading: mockLoading,
    retry: jest.fn(),
    refreshInventory: jest.fn(),
  }),
  useMusterSession: () => ({
    authenticated: mockAuthenticated,
    pending: false,
    connecting: false,
    connect: jest.fn(),
  }),
  useMusterMutationRefresh: () => mockRefresh,
}));

const HELM = { 'app.kubernetes.io/managed-by': 'Helm' };
/** The platform's charts label their infrastructure servers. */
const INFRASTRUCTURE = { ...HELM, [TOOL_GROUP_LABEL]: 'infrastructure' };

function makeServer(opts: {
  name: string;
  family?: string;
  mc?: string;
  state?: string;
  labels?: Record<string, string>;
  spec?: Record<string, unknown>;
  displayName?: string;
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name,
        namespace: 'muster',
        ...(opts.displayName
          ? {
              annotations: {
                'ui.giantswarm.io/display-name': opts.displayName,
              },
            }
          : {}),
        creationTimestamp: '2026-08-04T10:00:00Z',
        labels: {
          ...(opts.mc ? { [MANAGEMENT_CLUSTER_LABEL]: opts.mc } : {}),
          ...opts.labels,
        },
      },
      spec: {
        type: 'streamable-http',
        url: `https://${opts.name}.example.test/mcp`,
        autoStart: true,
        ...(opts.family
          ? {
              family: { name: opts.family, instanceArg: 'management_cluster' },
            }
          : {}),
        ...opts.spec,
      },
      status: { state: opts.state ?? 'Connected' },
    } as never,
    'gazelle',
  );
}

const makeServers = () => [
  makeServer({
    name: 'walrus-mcp-kubernetes',
    family: 'kubernetes',
    mc: 'walrus',
    labels: INFRASTRUCTURE,
  }),
  makeServer({
    name: 'gazelle-mcp-kubernetes',
    family: 'kubernetes',
    mc: 'gazelle',
    state: 'Failed',
    labels: INFRASTRUCTURE,
  }),
  makeServer({
    name: 'jira',
    spec: {
      auth: { type: 'oauth' },
      description: 'Search, read and update tickets',
    },
  }),
  makeServer({ name: 'grafana', labels: HELM }),
];

const TOOLS = [
  {
    name: 'x_jira_search_issues',
    summary: 'Find tickets with a query',
    annotations: { readOnlyHint: true },
  },
  { name: 'x_jira_add_comment', summary: 'Write a comment on a ticket' },
  { name: 'x_kubernetes_get_pods', summary: 'List pods' },
];

function makeApi() {
  return {
    filterTools: jest.fn(async () => ({
      total: TOOLS.length,
      filtered_count: TOOLS.length,
      truncated: false,
      tools: TOOLS,
    })),
    listServers: jest.fn(async () => ({
      mcpServers: [{ name: 'jira', resourcesCount: 2 }],
    })),
    getAuthStatus: jest.fn(async () => ({ servers: [] })),
    describeTool: jest.fn(async (name: string) => ({
      name,
      description: 'A tool.',
      inputSchema: { type: 'object', properties: {} },
    })),
    callTool: jest.fn(
      async (_tool: string, _args?: unknown, _installation?: string) =>
        ({}) as object,
    ),
    getMcpUsage: jest.fn(async () => ({
      available: true,
      range_hours: 720,
      step_hours: 24,
      buckets: [
        {
          start: '2026-10-18T00:00:00.000Z',
          ok: 3404,
          error: 4,
          error_result: 10,
        },
      ],
      totals: {
        calls: 3418,
        errors: 14,
        error_ratio: 0.004,
        p95_seconds: 0.42,
        distinct_tools: 1,
      },
      top_tools: [
        {
          tool: 'x_jira_search_issues',
          calls: 3418,
          errors: 14,
          p95_seconds: 0.42,
        },
      ],
      servers: [{ server: 'jira', calls: 3418, errors: 14, p95_seconds: 0.42 }],
    })),
  };
}

/** Where a navigation away from the connector page landed. */
function LocationProbe() {
  const { pathname, search } = useLocation();
  return <p>{`at ${pathname}${search}`}</p>;
}

/**
 * The page header's buttons, in order: every button before the tab strip
 * (the breadcrumbs above them are links).
 */
function headerButtons(): string[] {
  const tabs = screen.getByRole('tablist');
  return screen
    .getAllByRole('button')
    .filter(
      button =>
        button.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING,
    )
    .map(button => button.getAttribute('aria-label') ?? button.textContent!);
}

function TargetProbe() {
  const target = useConnectorPageTarget();
  return (
    <p>
      {`Used by ${target?.name}: ${target?.ownsTool('x_jira_add_comment')}, ${target?.readOnlyToolCount}`}
    </p>
  );
}

async function renderAt(
  path: string,
  {
    api = makeApi(),
    usedBy,
    customizeBound = true,
  }: {
    api?: ReturnType<typeof makeApi>;
    usedBy?: ReactElement;
    customizeBound?: boolean;
  } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    // The shell mounts the scope around its pages, as the app does.
    <ShellScopeProvider>
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Routes>
            {/* The connector wizard, where Edit leads. */}
            <Route
              path="/customize/connectors/:installation/:server/edit"
              element={<LocationProbe />}
            />
            <Route
              path="/customize/connectors/:installation/:server/*"
              element={<ConnectorPage usedBy={usedBy} />}
            />
          </Routes>
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </ShellScopeProvider>,
    {
      initialRouteEntries: [path],
      apis: [[musterApiRef, api as never]],
      mountedRoutes: {
        '/customize/connectors': mcpServersRouteRef,
        '/usage/connectors': usageConnectorsExternalRouteRef,
        ...(customizeBound && { '/customize': customizeExternalRouteRef }),
      },
    },
  );
  return api;
}

const BASE = '/customize/connectors/gazelle';

beforeEach(() => {
  mockServers = makeServers();
  mockAuthenticated = true;
  mockLoading = false;
  mockRefresh.mockClear();
});

describe('ConnectorPage', () => {
  it('heads the page with its place under Customize, its state and description', async () => {
    await renderAt(`${BASE}/jira`);

    expect(
      screen.getByRole('heading', { level: 1, name: 'jira' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customize' })).toHaveAttribute(
      'href',
      '/customize',
    );
    expect(screen.getByRole('link', { name: 'Connectors' })).toHaveAttribute(
      'href',
      '/customize/connectors',
    );
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(
      screen.getByText('Search, read and update tickets'),
    ).toBeInTheDocument();
  });

  it('leads its Connectors crumb back to the sub-tab that lists it', async () => {
    await renderAt(`${BASE}/kubernetes`);
    expect(screen.getByRole('link', { name: 'Connectors' })).toHaveAttribute(
      'href',
      '/customize/connectors/infrastructure',
    );
  });

  it('points the Connectors crumb at the sub-tab while loading, once it is known', async () => {
    mockLoading = true;
    // Read before (the persisted cache): the row is known while loading.
    await renderAt(`${BASE}/kubernetes`);
    expect(screen.getByRole('link', { name: 'Connectors' })).toHaveAttribute(
      'href',
      '/customize/connectors/infrastructure',
    );
    cleanup();

    await renderAt(`${BASE}/muster`);
    expect(screen.getByRole('link', { name: 'Connectors' })).toHaveAttribute(
      'href',
      '/customize/connectors/internal',
    );
    cleanup();

    // Not read yet: no link rather than one to a sub-tab that may not list it.
    mockServers = [];
    await renderAt(`${BASE}/jira`);
    expect(
      screen.queryByRole('link', { name: 'Connectors' }),
    ).not.toBeInTheDocument();
  });

  it("shows muster's own page with its endpoint to copy, under Internal", async () => {
    await renderAt(`${BASE}/muster`);

    expect(
      screen.getByRole('heading', { level: 1, name: 'muster' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Connectors' })).toHaveAttribute(
      'href',
      '/customize/connectors/internal',
    );
    expect(
      screen.getByText(/It comes with the Agent Platform/),
    ).toBeInTheDocument();
    // Above the tabs, not among the facts.
    const endpoint = screen.getByText(
      'https://muster.gazelle.example.test/mcp',
    );
    expect(endpoint.closest('p')).toHaveTextContent(
      'Endpoint https://muster.gazelle.example.test/mcp',
    );
    expect(
      within(endpoint.closest('p')!).getByRole('button', {
        name: 'Copy endpoint',
      }),
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole('tab', { name: /^Tools/ })
        .compareDocumentPosition(endpoint) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    // Not a fact: muster has none, and no MCPServer, so no Details tab.
    expect(screen.queryByRole('tab', { name: 'Details' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
  });

  it('names the connector in the document title', async () => {
    await renderAt(`${BASE}/jira`);

    await waitFor(() => expect(document.title).toBe('jira · Connectors'));
  });

  it('heads the page, its crumb and the document title with the display name', async () => {
    mockServers = [
      makeServer({ name: 'mcp-jira', displayName: 'Acme Jira' }),
      ...makeServers(),
    ];
    await renderAt(`${BASE}/mcp-jira`);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Acme Jira' }),
    ).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByText('Acme Jira')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Acme Jira · Connectors'));
  });

  it('names Customize without a link where Customize is not bound', async () => {
    await renderAt(`${BASE}/jira`, { customizeBound: false });

    // The Connectors list is the tab's own route, so it still links.
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByText('Customize')).toBeInTheDocument();
    expect(
      within(breadcrumb)
        .getAllByRole('link')
        // The back arrow has no text, only its label.
        .map(link => link.textContent || link.getAttribute('aria-label')),
    ).toEqual(['Back to Connectors', 'Connectors']);
  });

  it('lists the facts on the Details tab, not beside the content', async () => {
    const api = await renderAt(`${BASE}/jira`);
    expect(
      screen.queryByRole('complementary', { name: 'Connector details' }),
    ).toBeNull();

    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    const facts = await screen.findByRole('region', {
      name: 'Connector details',
    });
    expect(
      within(facts).getByText('Each person signs in with their own account'),
    ).toBeInTheDocument();
    expect(
      within(facts).getByText('1 of 1 instance healthy'),
    ).toBeInTheDocument();
    // The Usage tab's 30 days, read for this connector alone.
    expect(within(facts).getByText('Calls, last 30 days')).toBeInTheDocument();
    expect(
      await within(facts).findByText('3,418 · 0.4% errors'),
    ).toBeInTheDocument();
    expect(api.getMcpUsage).toHaveBeenCalledWith({
      installation: 'gazelle',
      hours: 720,
      servers: ['jira'],
    });
    expect(within(facts).getByText('4 Aug 2026')).toBeInTheDocument();
    // The address is technical: in the fold-out's configuration.
    expect(screen.queryByText('https://jira.example.test/mcp')).toBeNull();
  });

  it('keeps the tools search across a visit to another tab', async () => {
    await renderAt(`${BASE}/jira?q=search`);

    const searchbox = () =>
      screen.getByRole('searchbox', { name: 'Search tools' });
    expect(
      await screen.findByRole('link', { name: /search_issues/ }),
    ).toBeInTheDocument();
    expect(searchbox()).toHaveValue('search');
    expect(screen.queryByRole('link', { name: /add_comment/ })).toBeNull();

    // The address's search, back from Details.
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    await screen.findByRole('region', { name: 'Connector details' });
    await userEvent.click(screen.getByRole('tab', { name: /^Tools/ }));
    expect(searchbox()).toHaveValue('search');
    expect(screen.queryByRole('link', { name: /add_comment/ })).toBeNull();

    // And one typed on the tab, which the address does not carry.
    await userEvent.clear(searchbox());
    await userEvent.type(searchbox(), 'comment');
    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    await userEvent.click(screen.getByRole('tab', { name: /^Tools/ }));
    expect(searchbox()).toHaveValue('comment');
    expect(
      screen.getByRole('link', { name: /add_comment/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /search_issues/ })).toBeNull();
  });

  it('holds the Tools count’s place in the frame drawn while the connectors load', async () => {
    mockLoading = true;
    await renderAt(`${BASE}/jira`);

    expect(
      screen
        .getByRole('tab', { name: 'Tools' })
        .querySelector('[data-count="loading"]'),
    ).not.toBeNull();
  });

  it('holds the Tools count’s place while the tools load', async () => {
    const api = makeApi();
    let answer: (value: unknown) => void = () => {};
    api.filterTools.mockImplementationOnce(
      () => new Promise(resolve => (answer = resolve)) as never,
    );
    await renderAt(`${BASE}/jira`, { api });

    const tools = screen.getByRole('tab', { name: 'Tools' });
    expect(tools.querySelector('[data-count="loading"]')).not.toBeNull();

    answer({ total: 2, filtered_count: 2, truncated: false, tools: TOOLS });
    expect(await screen.findByRole('tab', { name: /^Tools \(\d+\)$/ })).toBe(
      tools,
    );
    expect(tools.querySelector('[data-count="loading"]')).toBeNull();
  });

  it('lists a few tools without search or filter, each a link to its page', async () => {
    await renderAt(`${BASE}/jira`);

    expect(
      await screen.findByRole('link', { name: /search_issues/ }),
    ).toHaveAttribute('href', `${BASE}/jira/tools/x_jira_search_issues`);
    expect(
      screen.getByRole('link', { name: /add_comment/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/get_pods/)).not.toBeInTheDocument();
    // Two tools are read, not searched (the filter is covered at scale in
    // ConnectorToolsTab.test.tsx).
    expect(
      screen.queryByRole('searchbox', { name: 'Search tools' }),
    ).toBeNull();
    expect(screen.queryByRole('radio', { name: /Reads/ })).toBeNull();
    // Trying a tool is its page's: nothing runs from the list.
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('shows the attached Used by tab with the connector as its target', async () => {
    await renderAt(`${BASE}/jira/used-by`, { usedBy: <TargetProbe /> });

    expect(screen.getByRole('tab', { name: /Used by/ })).toBeInTheDocument();
    expect(
      await screen.findByText('Used by jira: true, 1'),
    ).toBeInTheDocument();
  });

  it('leaves Used by out when nothing is attached, and shows Resources when there are some', async () => {
    await renderAt(`${BASE}/jira`);

    expect(
      await screen.findByRole('tab', { name: /Resources/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /Used by/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /Prompts/ }),
    ).not.toBeInTheDocument();
  });

  it('opens the connector wizard on this connector from Edit', async () => {
    await renderAt(`${BASE}/jira`);

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(
      await screen.findByText('at /customize/connectors/gazelle/jira/edit'),
    ).toBeInTheDocument();
  });

  it('leaves the Settings tab out of the tab strip', async () => {
    await renderAt(`${BASE}/jira`);

    expect(screen.getByRole('tab', { name: /Tools/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: /Settings/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps Edit of a connector managed in Git in place, disabled, naming GitOps', async () => {
    await renderAt(`${BASE}/grafana`);

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription(/managed by GitOps/);

    // The tooltip opens from the wrapper: a disabled button takes no hover.
    await userEvent.hover(edit.parentElement!);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /managed by GitOps/,
    );

    // Where it is changed instead is in the menu.
    expect(headerButtons()).toEqual(['Edit', 'More actions']);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      screen.getByRole('menuitem', { name: 'Edit in Git…' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Remove…' }),
    ).not.toBeInTheDocument();
  });

  it("puts a family's instances on their own tab", async () => {
    await renderAt(`${BASE}/kubernetes/instances`);

    expect(
      await screen.findByRole('tab', { name: /Instances/, selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByText('walrus-mcp-kubernetes')).toBeInTheDocument();
    // Helm-applied instances: changed in Git, not here.
    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription(/managed by GitOps/);
  });

  it('keeps Edit and the menu in place without a muster session, disabled with the reason', async () => {
    mockAuthenticated = false;
    await renderAt(`${BASE}/jira`);

    expect(headerButtons()).toEqual(['Edit', 'More actions']);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Edit' }),
    ).toHaveAccessibleDescription(/muster session, which is not connected/);
    expect(screen.getByRole('button', { name: 'More actions' })).toBeDisabled();
  });

  it('offers Edit as JSON where the wizard cannot represent the connector', async () => {
    mockServers = [
      ...makeServers(),
      makeServer({
        name: 'local-tools',
        spec: { type: 'stdio', url: undefined, command: 'local-tools' },
      }),
    ];
    await renderAt(`${BASE}/local-tools`);

    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAccessibleDescription(/Edit as JSON/);
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Edit as JSON…' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Edit as JSON — local-tools',
      }),
    ).toBeInTheDocument();
  });

  it('shows the same header actions whether or not the person is signed in to the connector', async () => {
    // Signed out: the tools are hidden, and the Tools tab offers the sign-in.
    const signedOut = makeApi();
    signedOut.getAuthStatus.mockResolvedValue({
      servers: [{ name: 'jira', status: 'auth_required' }],
    } as never);
    signedOut.filterTools.mockResolvedValue({
      total: 0,
      filtered_count: 0,
      truncated: false,
      tools: [],
    });
    await renderAt(`${BASE}/jira`, { api: signedOut });
    expect(
      await screen.findByText('Sign in to this connector to see its tools.'),
    ).toBeInTheDocument();
    const signedOutHeader = headerButtons();
    cleanup();

    // Signed in: Sign out joins the menu, the header itself is unchanged.
    const signedIn = makeApi();
    signedIn.getAuthStatus.mockResolvedValue({
      servers: [{ name: 'jira', status: 'connected' }],
    } as never);
    await renderAt(`${BASE}/jira`, { api: signedIn });
    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      await screen.findByRole('menuitem', { name: 'Sign out' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    expect(signedOutHeader).toEqual(['Edit', 'More actions']);
    expect(headerButtons()).toEqual(signedOutHeader);
  });

  it('says in full why muster could not connect an SSO connector (T104)', async () => {
    // The Customize list keeps this to "Could not sign in" and a hint.
    const api = makeApi();
    api.getAuthStatus.mockResolvedValue({
      servers: [
        {
          name: 'grafana',
          status: 'connected',
          token_forwarding_enabled: true,
          sso_attempt_failed: true,
        },
      ],
    } as never);
    await renderAt(`${BASE}/grafana`, { api });

    expect(
      await screen.findByText(
        "grafana authenticates through SSO from muster's own session, so there is nothing to sign in to here. muster tried and failed to establish it for your session — check the connector's trusted audiences with an administrator.",
      ),
    ).toBeInTheDocument();
  });

  it('offers reconnect, turn off and remove, and confirms a removal', async () => {
    await renderAt(`${BASE}/jira`);

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      screen.getByRole('menuitem', { name: 'Reconnect…' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Turn off…' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remove…' }));

    expect(
      await screen.findByRole('heading', { name: 'Remove "jira"?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('says so when the installation has no such connector', async () => {
    await renderAt(`${BASE}/nope`);

    expect(
      screen.getByText('No connector “nope” on gazelle'),
    ).toBeInTheDocument();
  });
});

describe('ConnectorPage Usage tab', () => {
  it("sits before Used by and shows the connector's figures", async () => {
    await renderAt(`${BASE}/jira/usage`, { usedBy: <TargetProbe /> });

    const tabs = screen.getAllByRole('tab').map(tab => tab.textContent);
    expect(tabs.indexOf('Usage')).toBe(tabs.indexOf('Used by') - 1);
    expect(
      screen.getByRole('tab', { name: 'Usage', selected: true }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Every caller's tool calls to this connector over the last 30 days on gazelle.",
      ),
    ).toBeInTheDocument();
    // One of the two tools it offers was called.
    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in Usage' })).toHaveAttribute(
      'href',
      '/usage/connectors?installation=gazelle',
    );
  });

  it('covers the window Usage → Connectors linked with; Details keeps 30 days', async () => {
    const api = await renderAt(`${BASE}/jira/usage?window=90d`);

    expect(
      await screen.findByText(
        "Every caller's tool calls to this connector over the last 90 days on gazelle.",
      ),
    ).toBeInTheDocument();
    expect(api.getMcpUsage).toHaveBeenCalledWith({
      installation: 'gazelle',
      hours: 2160,
      servers: ['jira'],
    });
    // The way back opens Usage → Connectors on the same window, and each
    // tool's Usage tab covers it too.
    expect(screen.getByRole('link', { name: 'Open in Usage' })).toHaveAttribute(
      'href',
      '/usage/connectors?installation=gazelle&window=90d',
    );
    const toolLinks = screen
      .getAllByRole('link')
      .map(link => link.getAttribute('href') ?? '')
      .filter(href => href.includes('/tools/'));
    expect(toolLinks.length).toBeGreaterThan(0);
    for (const href of toolLinks) {
      expect(href).toMatch(/\/usage\?window=90d$/);
    }

    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    await screen.findByText('Calls, last 30 days');
    await waitFor(() =>
      expect(api.getMcpUsage).toHaveBeenLastCalledWith({
        installation: 'gazelle',
        hours: 720,
        servers: ['jira'],
      }),
    );
  });

  it('reads the usage once for the tab and the Details facts', async () => {
    const api = await renderAt(`${BASE}/jira/usage`);
    await screen.findByText('1 of 2');

    await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
    await screen.findByText('3,418 · 0.4% errors');

    expect(api.getMcpUsage).toHaveBeenCalledTimes(1);
  });

  it("reads a family's usage for all its instances", async () => {
    const api = await renderAt(`${BASE}/kubernetes/usage`);

    await screen.findByRole('tab', { name: 'Usage', selected: true });
    await waitFor(() =>
      expect(api.getMcpUsage).toHaveBeenCalledWith({
        installation: 'gazelle',
        hours: 720,
        servers: ['gazelle-mcp-kubernetes', 'walrus-mcp-kubernetes'],
      }),
    );
  });

  it('reads no usage on Tools, where a connector opens and shows none', async () => {
    const api = await renderAt(`${BASE}/jira`);

    expect(
      await screen.findByRole('link', { name: /search_issues/ }),
    ).toBeInTheDocument();
    expect(api.getMcpUsage).not.toHaveBeenCalled();
  });

  it('asks for a muster session instead of reading the usage', async () => {
    mockAuthenticated = false;
    const api = await renderAt(`${BASE}/jira/usage`);

    expect(
      screen.getByText(/Usage figures need a muster session/),
    ).toBeInTheDocument();
    expect(api.getMcpUsage).not.toHaveBeenCalled();
  });

  it("is not on muster's own page, whose own tools no connector counts", async () => {
    const api = await renderAt(`${BASE}/muster/usage`);

    expect(
      await screen.findByRole('tab', { name: /Tools/, selected: true }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Usage' })).toBeNull();
    expect(api.getMcpUsage).not.toHaveBeenCalled();
  });
});

describe('ConnectorPage at phone width', () => {
  let layout: MockedLayout;
  beforeEach(() => {
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('keeps Edit and the menu in the header, and the facts on the Details tab', async () => {
    await renderAt(`${BASE}/jira/details`);

    // The header holds one button and the menu: nothing to overflow.
    expect(headerButtons()).toEqual(['Edit', 'More actions']);
    // No facts fold-out above the content any more: the tab holds them.
    expect(screen.queryByRole('button', { name: 'Details' })).toBeNull();
    expect(
      screen.getByRole('tab', { name: 'Details', selected: true }),
    ).toBeInTheDocument();
    const facts = screen.getByRole('region', { name: 'Connector details' });
    expect(
      within(facts).getByText('1 of 1 instance healthy'),
    ).toBeInTheDocument();
    const foldOut = screen.getByRole('button', { name: 'Technical details' });
    expect(
      facts.compareDocumentPosition(foldOut) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await userEvent.click(foldOut);
    expect(
      screen.getByText('https://jira.example.test/mcp'),
    ).toBeInTheDocument();
  });
});

describe('ConnectorPage Details tab', () => {
  const foldOut = () =>
    screen.getByRole('button', { name: 'Technical details' });

  it('folds the connector resource under the facts', async () => {
    await renderAt(`${BASE}/jira/details`);

    expect(foldOut()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('muster/jira')).toBeNull();

    await userEvent.click(foldOut());
    expect(screen.getByText('muster/jira')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Authentication' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('https://jira.example.test/mcp'),
    ).toBeInTheDocument();
  });

  it('reads at the page body size, facts and technical details alike', async () => {
    await renderAt(`${BASE}/jira/details`);
    await userEvent.click(foldOut());

    // FactList sets its labels and values, Mono among them, in bui's
    // body-medium (14px) inside the shell.
    for (const text of [
      '1 of 1 instance healthy',
      'muster/jira',
      'Auto start',
    ]) {
      expect(screen.getByText(text)).toHaveAttribute(
        'data-variant',
        'body-medium',
      );
    }
  });

  it("lists a family's facts and one instance's technical details", async () => {
    await renderAt(`${BASE}/kubernetes/details`);

    expect(
      within(
        screen.getByRole('region', { name: 'Connector details' }),
      ).getByText('1 of 2 instances healthy'),
    ).toBeInTheDocument();
    // A failed instance does not open the family's fold-out: the Instances
    // tab says which one.
    expect(foldOut()).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(foldOut());
    expect(
      screen.getByText(/each instance's own configuration, health and/),
    ).toBeInTheDocument();
  });

  it('keeps the resource name of a connector with a display name in its technical details', async () => {
    mockServers = [
      makeServer({ name: 'mcp-jira', displayName: 'Acme Jira' }),
      ...makeServers(),
    ];
    await renderAt(`${BASE}/mcp-jira/details`);
    await userEvent.click(foldOut());

    expect(screen.getByText('muster/mcp-jira')).toBeInTheDocument();
  });

  it('opens the fold-out on arrival while muster reports the connector failed', async () => {
    mockServers = [
      ...makeServers(),
      makeServer({ name: 'linear', state: 'Failed' }),
    ];
    await renderAt(`${BASE}/linear/details`);

    expect(foldOut()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('muster/linear')).toBeInTheDocument();
  });

  it("is not on muster's own page, whose address leads to its tools", async () => {
    await renderAt(`${BASE}/muster/details`);

    expect(
      await screen.findByRole('tab', { name: /^Tools/, selected: true }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Details' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Technical details' }),
    ).toBeNull();
  });
});
