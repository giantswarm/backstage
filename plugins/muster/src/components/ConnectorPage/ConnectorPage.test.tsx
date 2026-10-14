import { ReactElement } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
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
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
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
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name,
        namespace: 'muster',
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
      range_hours: 216,
      step_hours: 24,
      buckets: [],
      totals: {
        calls: 3418,
        errors: 14,
        error_ratio: 0.004,
        p95_seconds: null,
        distinct_tools: 2,
      },
      top_tools: [],
      servers: [{ server: 'jira', calls: 3418, errors: 14 }],
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
    <QueryClientProvider client={queryClient}>
      <PageHeaderActionsProvider>
        <Routes>
          {/* The connector wizard, where Edit leads. */}
          <Route
            path="/agent-platform/connectors/new"
            element={<LocationProbe />}
          />
          <Route
            path="/agent-platform/connectors/:server/*"
            element={<ConnectorPage usedBy={usedBy} />}
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>,
    {
      initialRouteEntries: [path],
      apis: [[musterApiRef, api as never]],
      mountedRoutes: {
        '/agent-platform/connectors': mcpServersRouteRef,
        ...(customizeBound && { '/customize': customizeExternalRouteRef }),
      },
    },
  );
  return api;
}

const BASE = '/agent-platform/connectors';

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
    // Not a fact: muster has none, so its page has no facts column.
    expect(
      screen.queryByRole('complementary', { name: 'Connector details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
  });

  it('names the connector in the document title', async () => {
    await renderAt(`${BASE}/jira`);

    await waitFor(() => expect(document.title).toBe('jira · Connectors'));
  });

  it('names its place under Customize without links where Customize is not bound', async () => {
    await renderAt(`${BASE}/jira`, { customizeBound: false });

    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByText('Customize')).toBeInTheDocument();
    expect(within(breadcrumb).queryByRole('link')).not.toBeInTheDocument();
  });

  it('lists the facts beside the content', async () => {
    const api = await renderAt(`${BASE}/jira`);

    const facts = screen.getByRole('complementary', {
      name: 'Connector details',
    });
    expect(
      within(facts).getByText('Each person signs in with their own account'),
    ).toBeInTheDocument();
    expect(
      within(facts).getByText('1 of 1 instance healthy'),
    ).toBeInTheDocument();
    expect(
      await within(facts).findByText('3,418 · 0.4% errors'),
    ).toBeInTheDocument();
    expect(api.getMcpUsage).toHaveBeenCalledWith({
      installation: 'gazelle',
      window: 'month',
    });
    expect(
      within(facts).getByText('https://jira.example.test/mcp'),
    ).toBeInTheDocument();
    expect(within(facts).getByText('4 Aug 2026')).toBeInTheDocument();
  });

  it('lists a few tools without search or filter and tries one inline', async () => {
    const api = await renderAt(`${BASE}/jira`);

    expect(
      await screen.findByRole('button', { name: /search_issues/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add_comment/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/get_pods/)).not.toBeInTheDocument();
    // Two tools are read, not searched (the filter is covered at scale in
    // ConnectorToolsTab.test.tsx).
    expect(
      screen.queryByRole('searchbox', { name: 'Search tools' }),
    ).toBeNull();
    expect(screen.queryByRole('radio', { name: /Reads/ })).toBeNull();

    await userEvent.click(
      screen.getByRole('button', { name: /search_issues/ }),
    );
    expect(await screen.findByText('Try it')).toBeInTheDocument();
    expect(
      await screen.findByText('Runs as you. Nothing is changed.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(() =>
      expect(api.callTool).toHaveBeenCalledWith(
        'x_jira_search_issues',
        {},
        'gazelle',
      ),
    );
  });

  it('does not promise that a tool which changes things changes nothing', async () => {
    await renderAt(`${BASE}/jira`);

    await userEvent.click(
      await screen.findByRole('button', { name: /add_comment/ }),
    );
    expect(await screen.findByText('Runs as you.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is changed/)).not.toBeInTheDocument();
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
      await screen.findByText('at /agent-platform/connectors/new?edit=jira'),
    ).toBeInTheDocument();
  });

  it('has no Settings tab, and sends its old address to the edit', async () => {
    await renderAt(`${BASE}/jira/settings`);

    expect(
      await screen.findByText('at /agent-platform/connectors/new?edit=jira'),
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

  it('sends the old settings address of a connector managed in Git to its tools', async () => {
    await renderAt(`${BASE}/grafana/settings`);

    expect(
      await screen.findByRole('tab', { name: /Tools/, selected: true }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
  });

  it("puts a family's instances on their own tab, where its old settings address leads", async () => {
    await renderAt(`${BASE}/kubernetes/settings`);

    expect(
      await screen.findByRole('tab', { name: /Instances/, selected: true }),
    ).toBeInTheDocument();
    expect(screen.getByText('walrus-mcp-kubernetes')).toBeInTheDocument();
    const facts = screen.getByRole('complementary', {
      name: 'Connector details',
    });
    expect(
      within(facts).getByText('1 of 2 instances healthy'),
    ).toBeInTheDocument();
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

describe('ConnectorPage at phone width', () => {
  let layout: MockedLayout;
  beforeEach(() => {
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('puts the facts first, folded, and keeps Edit and the menu in the header', async () => {
    await renderAt(`${BASE}/jira`);

    // The header holds one button and the menu: nothing to overflow.
    expect(headerButtons()).toEqual(['Edit', 'More actions']);
    // The facts are a "Details" fold-out above the tools, not a column
    // after hundreds of them.
    const details = screen.getByRole('button', { name: 'Details' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    const tool = await screen.findByRole('button', { name: /search_issues/ });
    expect(
      details.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByRole('complementary', { name: 'Connector details' }),
    ).toBeNull();

    await userEvent.click(details);
    expect(
      within(
        screen.getByRole('complementary', { name: 'Connector details' }),
      ).getByText('https://jira.example.test/mcp'),
    ).toBeInTheDocument();
  });
});

describe('ConnectorPage technical details', () => {
  const foldOut = () =>
    screen.getByRole('button', { name: 'Technical details' });

  it('folds the connector resource under the content, without what the facts say', async () => {
    await renderAt(`${BASE}/jira`);

    expect(foldOut()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('muster/jira')).toBeNull();

    await userEvent.click(foldOut());
    expect(screen.getByText('muster/jira')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Authentication' }),
    ).toBeInTheDocument();
    // The address stays the facts column's alone.
    expect(screen.getAllByText('https://jira.example.test/mcp')).toHaveLength(
      1,
    );
  });

  it('opens on arrival while muster reports the connector failed', async () => {
    mockServers = [
      ...makeServers(),
      makeServer({ name: 'linear', state: 'Failed' }),
    ];
    await renderAt(`${BASE}/linear`);

    expect(foldOut()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('muster/linear')).toBeInTheDocument();
  });

  it("has none on muster's own page", async () => {
    await renderAt(`${BASE}/muster`);

    expect(
      screen.queryByRole('button', { name: 'Technical details' }),
    ).toBeNull();
  });
});
