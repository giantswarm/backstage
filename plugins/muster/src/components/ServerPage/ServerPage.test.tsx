import { ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { MANAGEMENT_CLUSTER_LABEL, MCPServer } from '../../lib/k8s';
import { McpServersRouter } from '../McpServersRouter';

let mockHeaderActions: ReactNode = null;
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: (element: ReactNode) => {
    mockHeaderActions = element;
  },
}));

jest.mock('@giantswarm/backstage-plugin-flux-react', () => ({
  useGitOpsSource: () => ({ inGit: false, isLoading: false, errors: [] }),
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
    dataUpdatedAt: Date.now(),
    isRefreshing: false,
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
          path="/agent-platform/muster/servers/*"
          element={<McpServersRouter />}
        />
      </Routes>
    </QueryClientProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/muster': rootRouteRef },
      apis: [[musterApiRef, api as never]],
    },
  );
  return api;
}

const BASE = '/agent-platform/muster/servers';

/** The header actions the page last provided, rendered on their own. */
async function renderHeader() {
  if (!mockHeaderActions) {
    return undefined;
  }
  return renderInTestApp(<>{mockHeaderActions}</>);
}

beforeEach(() => {
  mockServers = makeServers();
  mockAuthenticated = true;
  mockHeaderActions = null;
  window.localStorage.clear();
});

describe('ServerPage tabs', () => {
  it('gives a family Overview, Tools, Resources, Prompts and Instances', async () => {
    await renderAt(`${BASE}/kubernetes?installation=gazelle`);

    expect(
      await screen.findByRole('heading', { name: 'kubernetes' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
        'Overview',
        'Tools 2',
        'Resources',
        'Prompts',
        'Instances 2',
      ]),
    );
    expect(screen.getAllByRole('tab').map(t => t.getAttribute('href'))).toEqual(
      [
        `${BASE}/kubernetes?installation=gazelle`,
        `${BASE}/kubernetes/tools?installation=gazelle`,
        `${BASE}/kubernetes/resources?installation=gazelle`,
        `${BASE}/kubernetes/prompts?installation=gazelle`,
        `${BASE}/kubernetes/instances?installation=gazelle`,
      ],
    );
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Overview',
    );
    expect(screen.getByText('1 of 2 instances healthy')).toBeInTheDocument();
    expect(screen.getByText('management_cluster')).toBeInTheDocument();
  });

  it('gives a singular server no Instances tab and shows counts muster reports', async () => {
    await renderAt(`${BASE}/aws-root/resources?installation=gazelle`);

    await waitFor(() =>
      expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual([
        'Overview',
        'Tools 2',
        // Reported by core_mcpserver_list; a missing count is not shown as 0.
        'Resources 3',
        'Prompts',
      ]),
    );
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Resources',
    );
    expect(
      await screen.findByText('This server exposes no resources.'),
    ).toBeInTheDocument();
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
        'Your muster session is not signed in to this server, so its tools are hidden.',
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
        'Overview',
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
    await renderAt(`${BASE}/aws-root?installation=gazelle`);
    await screen.findByRole('heading', { name: 'aws-root' });

    expect(mockHeaderActions).toBeNull();
    expect(
      screen.getByText(
        /run through the muster session, which is not available/,
      ),
    ).toBeInTheDocument();
  });
});
