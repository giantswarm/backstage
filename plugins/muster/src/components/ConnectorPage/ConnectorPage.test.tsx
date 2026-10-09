import { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { MANAGEMENT_CLUSTER_LABEL, MCPServer } from '../../lib/k8s';
import { ConnectorPage } from './ConnectorPage';
import { useConnectorPageTarget } from './connectorPageTarget';

jest.mock('@giantswarm/backstage-plugin-flux-react', () => ({
  useGitOpsSource: () => ({ isLoading: false }),
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
    isSingleInstallation: true,
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
    labels: HELM,
  }),
  makeServer({
    name: 'gazelle-mcp-kubernetes',
    family: 'kubernetes',
    mc: 'gazelle',
    state: 'Failed',
    labels: HELM,
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
    callTool: jest.fn(async () => ({})),
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
  }: { api?: ReturnType<typeof makeApi>; usedBy?: ReactElement } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <PageHeaderActionsProvider>
        <Routes>
          <Route
            path="/agent-platform/mcp-servers/:server/*"
            element={<ConnectorPage usedBy={usedBy} />}
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>,
    {
      initialRouteEntries: [path],
      apis: [[musterApiRef, api as never]],
    },
  );
  return api;
}

const BASE = '/agent-platform/mcp-servers';

beforeEach(() => {
  mockServers = makeServers();
  mockAuthenticated = true;
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

  it('lists the facts beside the content', async () => {
    await renderAt(`${BASE}/jira`);

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
    expect(
      within(facts).getByText('https://jira.example.test/mcp'),
    ).toBeInTheDocument();
    expect(within(facts).getByText('4 Aug 2026')).toBeInTheDocument();
  });

  it('filters the tools by what they do and tries one inline', async () => {
    const api = await renderAt(`${BASE}/jira`);

    expect(
      await screen.findByRole('button', { name: /search_issues/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add_comment/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/get_pods/)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All 2' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('radio', { name: 'Reads 1' }));
    expect(
      screen.queryByRole('button', { name: /add_comment/ }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: /search_issues/ }),
    );
    expect(await screen.findByText('Try it')).toBeInTheDocument();
    expect(
      await screen.findByText('Runs as you. Nothing is changed.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Execute' }));
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

  it('saves an edited address through muster', async () => {
    const api = await renderAt(`${BASE}/jira/settings`);

    const address = screen.getByRole('textbox', { name: /Server address/ });
    await userEvent.clear(address);
    await userEvent.type(address, 'https://jira.internal/mcp');
    await userEvent.click(
      screen.getByRole('button', { name: 'Save and reconnect' }),
    );

    await waitFor(() =>
      expect(api.callTool).toHaveBeenCalledWith(
        'core_mcpserver_update',
        expect.objectContaining({
          name: 'jira',
          url: 'https://jira.internal/mcp',
          auth: { type: 'oauth' },
          autoStart: true,
        }),
        'gazelle',
      ),
    );
  });

  it('shows a connector managed in Git read-only, with where to change it', async () => {
    await renderAt(`${BASE}/grafana/settings`);

    expect(
      screen.getByRole('textbox', { name: /Server address/ }),
    ).toHaveAttribute('readonly');
    expect(
      screen.getByRole('button', { name: 'Edit in Git' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save and reconnect' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'More actions' }),
    ).not.toBeInTheDocument();
  });

  it("puts a family's instances under Settings and its health in the facts", async () => {
    await renderAt(`${BASE}/kubernetes/settings`);

    expect(
      screen.getByRole('heading', { name: 'Instances' }),
    ).toBeInTheDocument();
    const facts = screen.getByRole('complementary', {
      name: 'Connector details',
    });
    expect(
      within(facts).getByText('1 of 2 instances healthy'),
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
      await screen.findByRole('heading', { name: 'Remove jira' }),
    ).toBeInTheDocument();
  });

  it('says so when the installation has no such connector', async () => {
    await renderAt(`${BASE}/nope`);

    expect(
      screen.getByText('No connector “nope” on gazelle'),
    ).toBeInTheDocument();
  });
});
