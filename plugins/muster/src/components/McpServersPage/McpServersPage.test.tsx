import { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import {
  MANAGEMENT_CLUSTER_LABEL,
  MCPServer,
  MCPServerState,
} from '../../lib/k8s';
import { NewMcpServerFormProvider } from '../NewMcpServerFormProvider';
import { McpServersPage } from './McpServersPage';

let mockHeaderActions: ReactNode = null;
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: (element: ReactNode) => {
    mockHeaderActions = element;
  },
}));

// The endpoint summary reads the session and the runtime list itself; it has
// its own tests.
jest.mock('./MusterSummary', () => ({
  MusterSummary: () => <div data-testid="muster-summary" />,
}));

let mcpServers: MCPServer[] = [];
let mockAuthenticated = true;
// What the provider says, so a test can put the page in its loading or
// no-muster state without a real inventory behind it.
let instanceOverrides: Record<string, unknown> = {};

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
    mcpServers,
    workflows: [],
    isLoading: false,
    retry: jest.fn(),
    refreshInventory: jest.fn(),
    ...instanceOverrides,
  }),
  useMusterSession: () => ({
    authenticated: mockAuthenticated,
    pending: false,
    connecting: false,
    connect: jest.fn(),
  }),
}));

const HELM = { 'app.kubernetes.io/managed-by': 'Helm' };

function makeServer(
  name: string,
  options: {
    family?: string;
    mc?: string;
    state?: MCPServerState;
    labels?: Record<string, string>;
    auth?: Record<string, unknown>;
  } = {},
): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name,
        labels: {
          ...(options.mc ? { [MANAGEMENT_CLUSTER_LABEL]: options.mc } : {}),
          ...options.labels,
        },
      },
      spec: {
        type: 'streamable-http',
        url: `https://${name}.example.test/mcp`,
        ...(options.family
          ? {
              family: {
                name: options.family,
                instanceArg: 'management_cluster',
              },
            }
          : {}),
        ...(options.auth ? { auth: options.auth } : {}),
      },
      status: { state: options.state ?? 'Connected' },
    } as never,
    'gazelle',
  );
}

const fleet = () => [
  makeServer('walrus-mcp-kubernetes', {
    family: 'kubernetes',
    mc: 'walrus',
    labels: HELM,
    auth: { type: 'oauth', forwardToken: true },
  }),
  makeServer('gazelle-mcp-kubernetes', {
    family: 'kubernetes',
    mc: 'gazelle',
    state: 'Failed',
    labels: HELM,
    auth: { type: 'oauth', forwardToken: true },
  }),
  makeServer('github', { labels: HELM, auth: { type: 'oauth' } }),
  makeServer('aws-root', { auth: { type: 'sigv4', sigv4: { region: 'x' } } }),
];

const withMiro = () => [
  ...fleet(),
  makeServer('miro', { state: 'Auth Required', auth: { type: 'oauth' } }),
];

const TOOLS = [
  { name: 'x_kubernetes_get_pods', description: 'List pods' },
  { name: 'x_kubernetes_logs', description: 'Pod logs' },
  { name: 'x_github_list_pulls', description: 'List pull requests' },
  { name: 'x_github_get_pod_template', description: 'Pod issue templates' },
  { name: 'x_aws-root_list_buckets', description: 'List buckets' },
  { name: 'core_workflow_list', description: 'List workflows' },
];

function makeApi() {
  return {
    filterTools: jest.fn(async () => ({
      total: TOOLS.length,
      filtered_count: TOOLS.length,
      truncated: false,
      tools: TOOLS,
    })),
  };
}

function CurrentPath() {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{`${pathname}${search}`}</div>;
}

const BASE = '/agent-platform/muster/servers';

async function renderPage(
  servers: MCPServer[],
  {
    path = `${BASE}?installation=gazelle`,
    overrides = {},
    api = makeApi(),
  }: {
    path?: string;
    overrides?: Record<string, unknown>;
    api?: ReturnType<typeof makeApi>;
  } = {},
) {
  mcpServers = servers;
  instanceOverrides = overrides;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route
          path={`${BASE}/*`}
          element={
            <NewMcpServerFormProvider>
              <McpServersPage />
              <CurrentPath />
            </NewMcpServerFormProvider>
          }
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

/** The table's rows below the header, as their cells' text. */
function rows() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent));
}

beforeEach(() => {
  mockAuthenticated = true;
  mockHeaderActions = null;
  instanceOverrides = {};
});

describe('McpServersPage', () => {
  it('lists one row per family, singular server and muster, sorted by name', async () => {
    await renderPage(fleet());

    await waitFor(() => expect(rows()[0][2]).toBe('1'));
    expect(screen.getAllByRole('columnheader').map(h => h.textContent)).toEqual(
      ['Server', 'Status', 'Tools', 'Auth', 'Source'],
    );
    expect(rows()).toEqual([
      [
        'aws-roothttps://aws-root.example.test/mcp',
        'Connected',
        '1',
        'AWS SigV4 (machine identity)',
        'User-registered server',
      ],
      [
        'githubhttps://github.example.test/mcp',
        'Connected',
        '2',
        'Own account (OAuth sign-in)',
        'Fleet server',
      ],
      [
        'kubernetesServer family',
        '1 of 2 instances healthy',
        '2',
        'Platform SSO (forwarded token)',
        'Fleet server',
      ],
      ['mustercore tools', '—', '1', 'Muster session', 'muster'],
    ]);
  });

  it.each([
    // Most tools first; muster's single tool and aws-root's tie, by name.
    ['Tools', 'descending', ['github', 'kubernetes', 'aws-root', 'muster']],
    // The degraded family first, muster (no status of its own) last.
    ['Status', 'ascending', ['kubernetes', 'aws-root', 'github', 'muster']],
    ['Source', 'ascending', ['github', 'kubernetes', 'muster', 'aws-root']],
  ])('sorts by %s', async (column, direction, expected) => {
    await renderPage(fleet());
    await waitFor(() => expect(rows()[0][2]).toBe('1'));

    const header = screen.getByRole('columnheader', { name: column });
    await userEvent.click(header);
    if (direction === 'descending') {
      await userEvent.click(header);
    }

    expect(
      rows().map(row => row[0]!.split(/https?:|Server family|core tools/)[0]),
    ).toEqual(expected);
  });

  it('links each row to its server page on the same installation', async () => {
    await renderPage(fleet());

    expect(
      await screen.findByRole('link', { name: /^kubernetes/ }),
    ).toHaveAttribute('href', `${BASE}/kubernetes?installation=gazelle`);
    expect(screen.getByRole('link', { name: /^muster/ })).toHaveAttribute(
      'href',
      `${BASE}/muster?installation=gazelle`,
    );
  });

  it('says a server waiting on a sign-in needs one, rather than that it has no tools', async () => {
    await renderPage(withMiro());

    await waitFor(() =>
      expect(rows().find(row => row[0]?.startsWith('miro'))?.[2]).toBe(
        'Sign-in needed',
      ),
    );
  });

  it('keeps servers matched by name, as a name match', async () => {
    // Every aws-root tool is `x_aws-root_…`: a name match must not read as
    // all of its tools matching, nor open them filtered.
    await renderPage(fleet(), { path: `${BASE}?installation=gazelle&q=aws` });

    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0][0]).toMatch(/^aws-root/);
    expect(rows()[0][2]).toBe('1');
    expect(screen.getByRole('link', { name: /^aws-root/ })).toHaveAttribute(
      'href',
      `${BASE}/aws-root?installation=gazelle`,
    );
  });

  it('keeps servers matched by a tool, says how many match and opens them filtered', async () => {
    await renderPage(fleet(), { path: `${BASE}?installation=gazelle&q=pod` });

    await waitFor(() =>
      expect(rows().map(row => [row[0], row[2]])).toEqual([
        ['githubhttps://github.example.test/mcp', '1 of 2 match'],
        ['kubernetesServer family', '2 of 2 match'],
      ]),
    );
    expect(screen.getByRole('link', { name: /^kubernetes/ })).toHaveAttribute(
      'href',
      `${BASE}/kubernetes?installation=gazelle&q=pod`,
    );
  });

  it('keeps the search in the URL', async () => {
    await renderPage(fleet());

    await userEvent.type(
      await screen.findByRole('searchbox', {
        name: 'Search servers and tools',
      }),
      'bucket',
    );

    await waitFor(() =>
      expect(screen.getByTestId('path')).toHaveTextContent(
        `${BASE}?installation=gazelle&q=bucket`,
      ),
    );
    expect(rows()).toHaveLength(1);
  });

  it('says so when nothing matches', async () => {
    await renderPage(fleet(), { path: `${BASE}?installation=gazelle&q=zzz` });

    expect(
      await screen.findByText('No server or tool matches “zzz”.'),
    ).toBeInTheDocument();
  });

  it('lists the servers from the CRDs without a muster session, and says what needs one', async () => {
    mockAuthenticated = false;
    const api = await renderPage(fleet(), {
      path: `${BASE}?installation=gazelle&q=pod`,
    });

    expect(
      await screen.findByRole('button', { name: 'Connect to muster' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/searching by tool name -- need an authenticated/),
    ).toBeInTheDocument();
    // Only names are searched; no server is named after pods.
    expect(
      screen.getByText(
        'No server name matches “pod”. Tool names are searched once connected to muster.',
      ),
    ).toBeInTheDocument();
    expect(api.filterTools).not.toHaveBeenCalled();
  });

  it('shows no tool counts without a muster session', async () => {
    mockAuthenticated = false;
    await renderPage(fleet());

    await screen.findByRole('link', { name: /^kubernetes/ });
    expect(rows().map(row => row[2])).toEqual(['—', '—', '—', '—']);
  });

  it('offers Register server in the page header', async () => {
    await renderPage(fleet());
    await screen.findByRole('link', { name: /^kubernetes/ });

    await renderInTestApp(<>{mockHeaderActions}</>);
    expect(
      screen.getByRole('button', { name: 'Register server' }),
    ).toBeInTheDocument();
  });

  it('shows the empty state, with the way to muster’s own tools, without MCPServer CRs', async () => {
    await renderPage([]);

    expect(screen.getByText('No MCP servers')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: "Open muster's own tools" }),
    ).toHaveAttribute('href', `${BASE}/muster?installation=gazelle`);
    // muster itself is still there to connect to.
    expect(screen.getByTestId('muster-summary')).toBeInTheDocument();
  });

  it('loads rather than claiming there is no muster while the fleet is still answering', async () => {
    await renderPage([], {
      overrides: { isLoading: true, activeInstallation: undefined },
    });

    // The indicator holds itself back 250ms, so a warm cache flashes nothing.
    expect(
      await screen.findByRole('progressbar', {
        name: "Reading the installation's MCP servers…",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('No muster installation'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No MCP servers')).not.toBeInTheDocument();
  });

  it('says there is no muster once the fleet has answered with none', async () => {
    await renderPage([], {
      overrides: { isLoading: false, activeInstallation: undefined },
    });

    expect(screen.getByText('No muster installation')).toBeInTheDocument();
    expect(screen.queryByTestId('muster-summary')).not.toBeInTheDocument();
  });
});
