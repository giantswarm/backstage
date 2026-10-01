import { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { mcpServersRouteRef } from '../../routes';
import { MANAGEMENT_CLUSTER_LABEL, MCPServer } from '../../lib/k8s';
import { McpServersRouter } from '../McpServersRouter';

let mockHeaderActions: ReactNode = null;
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: (element: ReactNode) => {
    mockHeaderActions = element;
  },
}));

const mockUseGitOpsSource = jest.fn();
jest.mock('@giantswarm/backstage-plugin-flux-react', () => ({
  useGitOpsSource: (...args: unknown[]) => mockUseGitOpsSource(...args),
}));

let mockServers: MCPServer[] = [];
let mockAuthenticated = true;
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: false,
    activeInstallationInfo: {
      name: 'gazelle',
      endpoint: 'https://muster.gazelle.example.com/mcp',
      requiresAuth: true,
    },
    setActiveInstallation: jest.fn(),
    mcpServers: mockServers,
    workflows: [],
    isLoading: false,
    retry: jest.fn(),
    refreshInventory: jest.fn(),
  }),
  useMusterSession: () => ({
    authenticated: mockAuthenticated,
    pending: false,
    connecting: false,
    connect: jest.fn(),
  }),
  useMusterMutationRefresh: () => jest.fn(),
}));

const HELM = { 'app.kubernetes.io/managed-by': 'Helm' };

function makeServer(opts: {
  name: string;
  family?: string;
  instanceArg?: string;
  mc?: string;
  state?: string;
  lastError?: string;
  labels?: Record<string, string>;
  spec?: Record<string, unknown>;
  /** muster's `Ready` condition, for a test that needs its explanation. */
  ready?: { status: 'True' | 'False'; reason: string; message: string };
}): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: opts.name,
        namespace: 'muster',
        labels: {
          ...(opts.mc ? { [MANAGEMENT_CLUSTER_LABEL]: opts.mc } : {}),
          ...opts.labels,
        },
      },
      spec: {
        type: 'streamable-http',
        url: `https://${opts.name}.example.test/mcp`,
        ...(opts.family
          ? {
              family: {
                name: opts.family,
                instanceArg: opts.instanceArg ?? 'management_cluster',
              },
            }
          : {}),
        ...opts.spec,
      },
      status: {
        state: opts.state ?? 'Connected',
        ...(opts.lastError ? { lastError: opts.lastError } : {}),
        ...(opts.ready
          ? { conditions: [{ type: 'Ready', ...opts.ready }] }
          : {}),
      },
    } as never,
    'gazelle',
  );
}

const makeServers = () => [
  makeServer({
    name: 'walrus-mcp-kubernetes',
    family: 'kubernetes',
    mc: 'walrus',
    labels: HELM,
  }),
  makeServer({
    name: 'gazelle-mcp-kubernetes',
    family: 'kubernetes',
    mc: 'gazelle',
    state: 'Failed',
    lastError: 'connection refused',
    labels: HELM,
  }),
  makeServer({
    name: 'heron-mcp-prometheus',
    family: 'prometheus',
    mc: 'heron',
    labels: HELM,
  }),
  makeServer({
    name: 'line-1',
    family: 'machines',
    instanceArg: 'machine',
  }),
  makeServer({
    name: 'line-2',
    family: 'machines',
    instanceArg: 'machine',
  }),
  makeServer({
    name: 'aws-root',
    spec: { auth: { type: 'oauth' } },
  }),
  makeServer({ name: 'grafana', labels: HELM }),
  makeServer({
    name: 'paused',
    state: 'Disconnected',
    spec: { suspended: true },
  }),
  makeServer({
    name: 'miro',
    state: 'Auth Required',
    spec: { auth: { type: 'oauth' } },
  }),
  makeServer({
    name: 'broken',
    state: 'Failed',
    lastError: 'dial tcp: connection refused',
    ready: {
      status: 'False',
      reason: 'ConnectionFailed',
      message: 'muster cannot reach the server.',
    },
  }),
  // A local process next to muster: the registration wizard cannot edit it.
  makeServer({ name: 'legacy', spec: { type: 'stdio', url: undefined } }),
  makeServer({
    name: 'lambda',
    spec: { auth: { type: 'sigv4', sigv4: { region: 'eu-central-1' } } },
  }),
];

const TOOLS = [
  { name: 'x_kubernetes_get_pods', description: 'List pods' },
  {
    name: 'x_walrus-mcp-kubernetes_describe',
    description: 'Describe, walrus only',
  },
  {
    name: 'x_aws-root_list_buckets',
    description: 'List buckets',
    annotations: { readOnlyHint: true },
  },
  { name: 'x_aws-root_delete_bucket', description: 'Delete a bucket' },
  { name: 'core_workflow_list', description: 'List workflows' },
];

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    filterTools: jest.fn(async () => ({
      total: TOOLS.length,
      filtered_count: TOOLS.length,
      truncated: false,
      tools: TOOLS,
    })),
    listServers: jest.fn(async () => ({
      mcpServers: [{ name: 'aws-root', resourcesCount: 3 }],
    })),
    listCoreTools: jest.fn(async () => ({
      total: 1,
      tools: TOOLS.filter(t => t.name.startsWith('core_')),
    })),
    filterResources: jest.fn(async () => ({ total: 0, resources: [] })),
    filterPrompts: jest.fn(async () => ({ total: 0, prompts: [] })),
    getAuthStatus: jest.fn(async () => ({ servers: [] })),
    describeTool: jest.fn(async (name: string) => ({
      name,
      description: 'List buckets',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: { region: { type: 'string' } },
      },
    })),
    callTool: jest.fn(async () => ({ buckets: ['a'] })),
    ...overrides,
  };
}

async function renderAt(path: string, api = makeApi()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route
          path="/agent-platform/mcp-servers/*"
          element={
            <>
              <McpServersRouter />
              <CurrentPath />
            </>
          }
        />
      </Routes>
    </QueryClientProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/mcp-servers': mcpServersRouteRef },
      apis: [[musterApiRef, api as never]],
    },
  );
  return api;
}

const BASE = '/agent-platform/mcp-servers';

function CurrentPath() {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{`${pathname}${search}`}</div>;
}

/** The header actions the page last provided, rendered on their own. */
async function renderHeader() {
  if (!mockHeaderActions) {
    return undefined;
  }
  return renderInTestApp(<>{mockHeaderActions}</>);
}

beforeEach(() => {
  mockUseGitOpsSource.mockReset();
  mockUseGitOpsSource.mockReturnValue({
    inGit: false,
    isLoading: false,
    errors: [],
  });
  mockServers = makeServers();
  mockAuthenticated = true;
  mockHeaderActions = null;
  window.localStorage.clear();
});

describe('ServerPage tabs', () => {
  it('gives a family Tools, Instances and Details', async () => {
    await renderAt(`${BASE}/kubernetes/details?installation=gazelle`);

    expect(
      await screen.findByRole('heading', { name: 'kubernetes' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
        'Tools (2)',
        'Instances (2)',
        'Details',
      ]),
    );
    expect(screen.getAllByRole('tab').map(t => t.getAttribute('href'))).toEqual(
      [
        `${BASE}/kubernetes?installation=gazelle`,
        `${BASE}/kubernetes/instances?installation=gazelle`,
        `${BASE}/kubernetes/details?installation=gazelle`,
      ],
    );
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Details',
    );
    expect(screen.getByText('1 of 2 instances healthy')).toBeInTheDocument();
    expect(screen.getByText('management_cluster')).toBeInTheDocument();
  });

  it('gives a singular server no Instances tab, and Resources and Prompts only with items', async () => {
    await renderAt(`${BASE}/aws-root/resources?installation=gazelle`);

    await waitFor(() =>
      expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
        'Tools (2)',
        // Reported by core_mcpserver_list; no count means none, no tab.
        'Resources (3)',
        'Details',
      ]),
    );
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Resources',
    );
    expect(
      await screen.findByText('This server exposes no resources.'),
    ).toBeInTheDocument();
  });

  it('sends a link to a tab without items to Tools', async () => {
    await renderAt(`${BASE}/aws-root/prompts?installation=gazelle`);

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `${BASE}/aws-root?installation=gazelle`,
      ),
    );
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Tools',
    );
  });

  it('sends muster’s own …/resources to Tools: it has none to read', async () => {
    await renderAt(`${BASE}/muster/resources?installation=gazelle`);

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `${BASE}/muster?installation=gazelle`,
      ),
    );
  });

  it('keeps an old …/overview link, now Details', async () => {
    await renderAt(`${BASE}/aws-root/overview?installation=gazelle`);

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `${BASE}/aws-root/details?installation=gazelle`,
      ),
    );
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Details',
    );
  });

  it('gives muster its own page with its core tools', async () => {
    await renderAt(`${BASE}/muster/tools?installation=gazelle`);

    expect(
      await screen.findByRole('link', { name: 'workflow_list' }),
    ).toHaveAttribute(
      'href',
      `${BASE}/muster/tools/core_workflow_list?installation=gazelle`,
    );
    expect(screen.getAllByRole('tab').map(t => t.textContent)).not.toContain(
      'Instances',
    );
    expect(screen.getByText('muster (core tools)')).toBeInTheDocument();
  });

  it('lands on Tools, and keeps an old …/tools link with its filter', async () => {
    await renderAt(`${BASE}/aws-root/tools?installation=gazelle&q=delete`);

    expect(
      await screen.findByRole('link', { name: 'delete_bucket' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Tools',
    );
    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `${BASE}/aws-root?installation=gazelle&q=delete`,
      ),
    );
  });

  it('says so when the installation has no such server', async () => {
    await renderAt(`${BASE}/nope?installation=gazelle`);

    expect(
      await screen.findByText('No server “nope” on gazelle'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the MCP servers' }),
    ).toHaveAttribute('href', `${BASE}?installation=gazelle`);
  });

  it('links the breadcrumb back to the list on the same installation', async () => {
    await renderAt(`${BASE}/aws-root?installation=gazelle`);

    const trail = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(trail).getByRole('link', { name: 'MCP Servers' }),
    ).toHaveAttribute('href', `${BASE}?installation=gazelle`);
  });
});

describe('ServerPage Tools tab', () => {
  it('lists short names linking to each tool page', async () => {
    await renderAt(`${BASE}/aws-root/tools?installation=gazelle`);

    expect(
      await screen.findByRole('link', { name: 'list_buckets' }),
    ).toHaveAttribute(
      'href',
      `${BASE}/aws-root/tools/x_aws-root_list_buckets?installation=gazelle`,
    );
    expect(screen.getByRole('link', { name: 'delete_bucket' })).toBeVisible();
    expect(screen.getByText('read-only')).toBeInTheDocument();
  });

  it('is a table sorted by name, and sorts by a header click', async () => {
    await renderAt(`${BASE}/aws-root?installation=gazelle`);

    await screen.findByRole('link', { name: 'list_buckets' });
    const toolNames = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map(row => within(row).getByRole('link').textContent);
    expect(toolNames()).toEqual(['delete_bucket', 'list_buckets']);
    expect(
      screen.getByRole('columnheader', { name: /Description/ }),
    ).toBeInTheDocument();
    // The markers have a column of their own.
    expect(
      screen.getByRole('columnheader', { name: /Annotations/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('row')[2]).toHaveTextContent('read-only');

    await userEvent.click(screen.getByRole('columnheader', { name: /Tool/ }));
    expect(toolNames()).toEqual(['list_buckets', 'delete_bucket']);
  });

  it('lists a family’s grouped tools and its instances’ own ones', async () => {
    await renderAt(`${BASE}/kubernetes/tools?installation=gazelle`);

    expect(
      await screen.findByRole('link', { name: 'get_pods' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'describe' })).toHaveAttribute(
      'href',
      `${BASE}/kubernetes/tools/x_walrus-mcp-kubernetes_describe?installation=gazelle`,
    );
    expect(
      screen.queryByRole('link', { name: 'list_buckets' }),
    ).not.toBeInTheDocument();
    // No tool of the family carries a marker, so there is no column for one.
    expect(
      screen.queryByRole('columnheader', { name: /Annotations/ }),
    ).not.toBeInTheDocument();
  });

  it('pages a long list, and goes back to the first page on a filter', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      name: `x_aws-root_tool_${String(i + 1).padStart(2, '0')}`,
      description: `Tool number ${i + 1}`,
    }));
    await renderAt(
      `${BASE}/aws-root?installation=gazelle`,
      makeApi({
        filterTools: jest.fn(async () => ({
          total: many.length,
          filtered_count: many.length,
          truncated: false,
          tools: many,
        })),
      }),
    );

    await screen.findByRole('link', { name: 'tool_01' });
    const toolNames = () =>
      screen
        .getAllByRole('row')
        .slice(1)
        .map(r => within(r).getByRole('link').textContent);
    expect(toolNames()).toHaveLength(25);

    await userEvent.click(
      screen.getByRole('button', { name: 'Next table page' }),
    );
    expect(toolNames()).toEqual([
      'tool_26',
      'tool_27',
      'tool_28',
      'tool_29',
      'tool_30',
    ]);

    await userEvent.type(
      screen.getByRole('searchbox', { name: 'Filter tools' }),
      'tool',
    );
    await waitFor(() => expect(toolNames()[0]).toBe('tool_01'));
    expect(screen.getByTestId('path')).toHaveTextContent('q=tool');
  });

  it('pre-fills its filter from ?q=', async () => {
    await renderAt(`${BASE}/aws-root/tools?installation=gazelle&q=delete`);

    expect(
      await screen.findByRole('link', { name: 'delete_bucket' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'list_buckets' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Filter tools' })).toHaveValue(
      'delete',
    );
  });

  it('shows the sign-in gate for a server whose tools need a sign-in', async () => {
    await renderAt(
      `${BASE}/aws-root/tools?installation=gazelle`,
      makeApi({
        filterTools: jest.fn(async () => ({ total: 0, tools: [] })),
        getAuthStatus: jest.fn(async () => ({
          servers: [
            {
              name: 'aws-root',
              status: 'auth_required',
              auth_tool: 'core_auth_login',
            },
          ],
        })),
      }),
    );

    expect(
      await screen.findByText(
        'Your muster session is not signed in to this server, so its tools, resources and prompts are hidden.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the session gate without a muster session', async () => {
    mockAuthenticated = false;
    const api = await renderAt(`${BASE}/aws-root/tools?installation=gazelle`);

    expect(
      await screen.findByText(/read through the muster session/),
    ).toBeInTheDocument();
    expect(api.filterTools).not.toHaveBeenCalled();
  });
});

describe('ServerPage Instances tab', () => {
  it('names the instance argument, the clusters and the coverage', async () => {
    await renderAt(`${BASE}/kubernetes/instances?installation=gazelle`);

    expect(
      await screen.findByText(/Callers choose an instance with/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: 'Management cluster' }),
    ).toBeInTheDocument();
    // The fleet is every cluster a family reaches: prometheus is on heron.
    expect(
      screen.getByText(
        'Missing from: heron. Present on 2 of 3 management clusters.',
      ),
    ).toBeInTheDocument();
    // Unhealthy first.
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0]).toHaveTextContent('gazelle-mcp-kubernetes');
    expect(rows[0]).toHaveTextContent('Failed');
    expect(rows[0]).toHaveTextContent('connection refused');
    const link = within(rows[0]).getByRole('link', {
      name: 'gazelle-mcp-kubernetes',
    });
    const params = new URLSearchParams(
      link.getAttribute('href')!.split('?')[1],
    );
    expect(params.get('installation')).toBe('gazelle');
    expect(params.get('pane')).toBe('mcp-server-instance');
    expect(params.get('name')).toBe('gazelle-mcp-kubernetes');
  });

  it('shows no cluster column for a family distributed over something else', async () => {
    await renderAt(`${BASE}/machines/instances?installation=gazelle`);

    expect(await screen.findByText('machine')).toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: 'Management cluster' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Present on/)).not.toBeInTheDocument();
  });

  it('opens an instance’s details in the drawer', async () => {
    await renderAt(
      `${BASE}/kubernetes/instances?installation=gazelle&pane=mcp-server-instance&cluster=gazelle&kind=MCPServer&namespace=muster&name=gazelle-mcp-kubernetes`,
    );

    expect(
      await screen.findByRole('button', { name: 'Close the drawer' }),
    ).toBeInTheDocument();
    // The instance's URL and full last error, which the table only truncates.
    expect(
      screen.getByText('https://gazelle-mcp-kubernetes.example.test/mcp'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText('connection refused').map(el => el.tagName),
    ).toContain('PRE');
  });

  it('does not exist for a singular server', async () => {
    await renderAt(`${BASE}/aws-root/instances?installation=gazelle`);

    await waitFor(() =>
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Tools',
      ),
    );
  });
});

describe('ServerPage header actions', () => {
  it('offers Edit and the live actions for a user-registered server', async () => {
    await renderAt(`${BASE}/aws-root?installation=gazelle`);
    await screen.findByRole('heading', { name: 'aws-root' });
    await renderHeader();

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Server actions' }),
    );
    expect(
      screen.getAllByRole('menuitem').map(item => item.textContent),
    ).toEqual(['Deactivate…', 'Reconnect…', 'Delete…']);
  });

  it('offers Edit/Remove for a fleet server', async () => {
    await renderAt(`${BASE}/grafana?installation=gazelle`);
    await screen.findByRole('heading', { name: 'grafana' });
    await renderHeader();

    expect(
      screen.getByRole('button', { name: 'Edit/Remove' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Server actions' }),
    ).not.toBeInTheDocument();
  });

  it('offers nothing for a family or for muster', async () => {
    await renderAt(`${BASE}/kubernetes?installation=gazelle`);
    await screen.findByRole('heading', { name: 'kubernetes' });
    expect(mockHeaderActions).toBeNull();
  });

  it('puts Sign in first while the server needs one', async () => {
    await renderAt(
      `${BASE}/aws-root?installation=gazelle`,
      makeApi({
        getAuthStatus: jest.fn(async () => ({
          servers: [
            {
              name: 'aws-root',
              status: 'auth_required',
              auth_tool: 'core_auth_login',
            },
          ],
        })),
      }),
    );
    await screen.findByRole('heading', { name: 'aws-root' });
    await waitFor(() => expect(mockHeaderActions).not.toBeNull());
    await waitFor(async () => {
      await renderHeader();
      expect(
        screen.getAllByRole('button', { name: 'Sign in' }).length,
      ).toBeGreaterThan(0);
    });
  });

  it('withholds the live actions without a muster session and says why', async () => {
    mockAuthenticated = false;
    await renderAt(`${BASE}/aws-root/details?installation=gazelle`);
    await screen.findByRole('heading', { name: 'aws-root' });

    expect(mockHeaderActions).toBeNull();
    expect(
      screen.getByText(
        /run through the muster session, which is not available/,
      ),
    ).toBeInTheDocument();
  });
});

describe('ServerPage review fixes', () => {
  it('names a deactivated server Deactivated in the header', async () => {
    await renderAt(`${BASE}/paused?installation=gazelle`);

    const heading = await screen.findByRole('heading', { name: 'paused' });
    expect(heading.parentElement).toHaveTextContent('Deactivated');
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
  });

  it('shows no Resources for a server the session is not signed in to', async () => {
    // core_mcpserver_list counts per session: none before the sign-in.
    await renderAt(`${BASE}/miro/resources?installation=gazelle`);

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `${BASE}/miro?installation=gazelle`,
      ),
    );
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
      'Tools (0)',
      'Details',
    ]);
  });

  it('goes back to the list once the server is deleted', async () => {
    // The router scrolls to the top on navigation; jsdom has no scrolling.
    jest.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    const api = await renderAt(`${BASE}/aws-root?installation=gazelle`);
    await screen.findByRole('heading', { name: 'aws-root' });
    const header = await renderHeader();
    await userEvent.click(
      within(header!.container).getByRole('button', { name: 'Server actions' }),
    );
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    // The header was rendered on its own; its Delete opened the page's dialog.
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete' }),
    );

    await waitFor(() =>
      expect(api.callTool).toHaveBeenCalledWith(
        'core_mcpserver_delete',
        { name: 'aws-root' },
        'gazelle',
      ),
    );
    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `${BASE}?installation=gazelle`,
      ),
    );
  });

  it('says what a refused sign-in from the header answered', async () => {
    jest.spyOn(window, 'open').mockReturnValue(null);
    await renderAt(
      `${BASE}/aws-root?installation=gazelle`,
      makeApi({
        getAuthStatus: jest.fn(async () => ({
          servers: [
            {
              name: 'aws-root',
              status: 'auth_required',
              auth_tool: 'core_auth_login',
            },
          ],
        })),
        signInServer: jest.fn(async () => ({
          status: 'error',
          message: 'The authorization server rejected the client.',
        })),
      }),
    );
    await screen.findByRole('heading', { name: 'aws-root' });
    await waitFor(() => expect(mockHeaderActions).not.toBeNull());
    const header = await renderHeader();
    await userEvent.click(
      within(header!.container).getByRole('button', { name: 'Sign in' }),
    );

    expect(
      await screen.findByText('The authorization server rejected the client.'),
    ).toBeInTheDocument();
  });
});

/** Opens the header's overflow menu; resolves to the offered items' labels. */
async function menuItems() {
  const header = await renderHeader();
  await userEvent.click(
    within(header!.container).getByRole('button', { name: 'Server actions' }),
  );
  return screen.getAllByRole('menuitem').map(item => item.textContent);
}

describe('ServerPage lifecycle and edit actions', () => {
  it('offers only Activate for a deactivated server', async () => {
    await renderAt(`${BASE}/paused?installation=gazelle`);
    await screen.findByRole('heading', { name: 'paused' });

    expect(await menuItems()).toEqual(['Activate…', 'Delete…']);
  });

  it('withholds Reconnect for an OAuth server waiting on a sign-in, and says why', async () => {
    await renderAt(`${BASE}/miro/details?installation=gazelle`);
    await screen.findByRole('heading', { name: 'miro' });

    expect(await menuItems()).toEqual(['Deactivate…', 'Delete…']);
    expect(
      screen.getByText(/reconnecting cannot sign a session in/),
    ).toBeInTheDocument();
  });

  it('opens the registration wizard on the server for Edit', async () => {
    await renderAt(`${BASE}/aws-root?installation=gazelle`);
    await screen.findByRole('heading', { name: 'aws-root' });
    const header = await renderHeader();
    await userEvent.click(
      within(header!.container).getByRole('button', { name: 'Edit' }),
    );

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `${BASE}/new?edit=aws-root`,
      ),
    );
  });

  it('offers the JSON editor for a server the wizard cannot edit, and says why', async () => {
    await renderAt(`${BASE}/legacy/details?installation=gazelle`);
    await screen.findByRole('heading', { name: 'legacy' });
    const header = await renderHeader();

    expect(
      within(header!.container).getByRole('button', { name: 'Edit as JSON' }),
    ).toBeInTheDocument();
    expect(
      within(header!.container).queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/only covers remote \(streamable-http or SSE\) servers/),
    ).toBeInTheDocument();
  });
});

describe('ServerPage session auth', () => {
  it('offers Sign out in the menu for a signed-in OAuth server', async () => {
    await renderAt(
      `${BASE}/aws-root?installation=gazelle`,
      makeApi({
        getAuthStatus: jest.fn(async () => ({
          servers: [{ name: 'aws-root', status: 'connected' }],
        })),
      }),
    );
    await screen.findByRole('heading', { name: 'aws-root' });

    await waitFor(async () => {
      expect(await menuItems()).toContain('Sign out');
    });
  });

  it('offers no sign-in for a sigv4 server, which signs as muster itself', async () => {
    await renderAt(
      `${BASE}/lambda/details?installation=gazelle`,
      makeApi({
        getAuthStatus: jest.fn(async () => ({
          servers: [{ name: 'lambda', status: 'auth_required' }],
        })),
      }),
    );
    await screen.findByRole('heading', { name: 'lambda' });
    const header = await renderHeader();

    expect(
      within(header!.container).queryByRole('button', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/muster's own AWS machine identity/)).toBeVisible();
  });
});

describe('ServerPage Details', () => {
  it('links a fleet server to its GitOps source', async () => {
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      url: 'https://github.com/example/fleet/tree/main/servers',
      errors: [],
    });
    await renderAt(`${BASE}/grafana/details?installation=gazelle`);

    expect(
      await screen.findByText('Managed through GitOps'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Source/ })).toHaveAttribute(
      'href',
      'https://github.com/example/fleet/tree/main/servers',
    );
  });

  it('looks up no GitOps source for a family that is not managed through it', async () => {
    await renderAt(`${BASE}/machines/details?installation=gazelle`);
    await screen.findByRole('heading', { name: 'machines' });

    expect(mockUseGitOpsSource).not.toHaveBeenCalled();
    expect(
      screen.getByText(/A family is not edited from this page/),
    ).toBeInTheDocument();
  });

  it('explains a failed server: the state on its badge, the diagnostics in Health', async () => {
    await renderAt(`${BASE}/broken/details?installation=gazelle`);

    const heading = await screen.findByRole('heading', { name: 'broken' });
    expect(
      within(heading.parentElement!).getByTitle(
        'muster cannot reach the server.',
      ),
    ).toHaveTextContent('Failed');
    expect(screen.getByRole('heading', { name: 'Health' })).toBeInTheDocument();
    expect(
      screen.getByText('dial tcp: connection refused'),
    ).toBeInTheDocument();
  });
});
