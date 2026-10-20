import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { mockPhoneLayout } from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { musterApiRef } from '../../apis';
import { customizeExternalRouteRef, mcpServersRouteRef } from '../../routes';
import { MCPServer } from '../../lib/k8s';
import { McpServersRouter } from '../McpServersRouter';

jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: jest.fn(),
}));

// The muster providers, whose instance the mock below stands for.
jest.mock('../MusterSubPage', () => ({
  MusterSubPage: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

let mockAuthenticated = true;
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    activeInstallationInfo: { name: 'gazelle', requiresAuth: true },
    mcpServers: [
      new MCPServer(
        {
          apiVersion: 'muster.giantswarm.io/v1alpha1',
          kind: 'MCPServer',
          metadata: { name: 'aws-root', namespace: 'muster' },
          spec: { type: 'streamable-http' },
          status: { state: 'Connected' },
        } as never,
        'gazelle',
      ),
      new MCPServer(
        {
          apiVersion: 'muster.giantswarm.io/v1alpha1',
          kind: 'MCPServer',
          metadata: { name: 'jira', namespace: 'muster' },
          // Each person signs in with their own account: calls run as them.
          spec: { type: 'streamable-http', auth: { type: 'oauth' } },
          status: { state: 'Connected' },
        } as never,
        'gazelle',
      ),
    ],
    workflows: [],
    isLoading: false,
  }),
  useMusterSession: () => ({
    authenticated: mockAuthenticated,
    pending: false,
    connecting: false,
    connect: jest.fn(),
  }),
  useMusterMutationRefresh: () => jest.fn(),
}));

function makeApi() {
  return {
    filterTools: jest.fn(async () => ({
      total: 3,
      tools: [
        { name: 'x_aws-root_list_buckets' },
        { name: 'x_jira_search_issues' },
        { name: 'x_jira_add_comment' },
      ],
    })),
    describeTool: jest.fn(async (name: string) => ({
      name,
      description: 'List the buckets of the account.',
      // Only adding a comment changes anything.
      annotations: { readOnlyHint: !name.endsWith('add_comment') },
      inputSchema: {
        type: 'object',
        properties: { region: { type: 'string', description: 'AWS region' } },
      },
    })),
    callTool: jest.fn(async () => ({ buckets: ['logs'] })),
    getMcpUsage: jest.fn(async () => ({
      available: true,
      range_hours: 720,
      step_hours: 24,
      buckets: [],
      totals: {
        calls: 1250,
        errors: 7,
        error_ratio: 7 / 1250,
        p95_seconds: 0.42,
        distinct_tools: 1,
      },
      top_tools: [
        {
          tool: 'x_jira_search_issues',
          calls: 1250,
          errors: 7,
          p95_seconds: 0.42,
        },
      ],
      servers: [{ server: 'jira', calls: 1250, errors: 7, p95_seconds: 0.42 }],
    })),
  };
}

const BASE = '/customize/connectors';

async function renderAt(path: string, api = makeApi()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <PageHeaderActionsProvider>
        <Routes>
          <Route
            path="/customize/connectors/*"
            element={<McpServersRouter />}
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: {
        '/customize/connectors': mcpServersRouteRef,
        '/customize': customizeExternalRouteRef,
      },
      apis: [[musterApiRef, api as never]],
    },
  );
  return api;
}

beforeEach(() => {
  mockAuthenticated = true;
  window.localStorage.clear();
});

describe('ToolPage', () => {
  it('shows the tool under its server and runs it', async () => {
    const api = await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets`,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'list_buckets' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('List the buckets of the account.'),
    ).toBeInTheDocument();
    // Once, beside the title, as the Tools list's row says it: the panel
    // shows no badge of its own.
    expect(screen.getAllByText('Reads')).toHaveLength(1);
    expect(screen.getByText('Input schema')).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { level: 2, name: 'Try it' }),
    ).toBeInTheDocument();
    // Read-only and run with the portal's own credentials.
    expect(screen.getByText('Nothing is changed.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Result' }),
    ).toBeInTheDocument();
    expect(api.callTool).toHaveBeenCalledWith(
      'x_aws-root_list_buckets',
      {},
      'gazelle',
    );
  });

  it('says a tool of a connector each person signs in to runs as them', async () => {
    await renderAt(`${BASE}/gazelle/jira/tools/x_jira_search_issues`);
    expect(
      await screen.findByText('Runs as you. Nothing is changed.'),
    ).toBeInTheDocument();
  });

  it('does not promise that a tool which changes things changes nothing', async () => {
    await renderAt(`${BASE}/gazelle/jira/tools/x_jira_add_comment`);
    expect(await screen.findByText('Runs as you.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is changed/)).not.toBeInTheDocument();
    // The Tools list's word for it, never the server's "destructive".
    expect(screen.getByText('Changes things')).toBeInTheDocument();
    expect(screen.queryByText(/destructive/i)).not.toBeInTheDocument();
  });

  it('leads back to the Tools search and filter it was opened from', async () => {
    await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets?q=list&effect=reads`,
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'aws-root' },
      ),
    ).toHaveAttribute('href', `${BASE}/gazelle/aws-root?q=list&effect=reads`);
  });

  it('does not show a tool under a server that does not offer it', async () => {
    const api = await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_kubernetes_get_pods`,
    );

    expect(
      await screen.findByText('No tool “x_kubernetes_get_pods” on gazelle'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the tools of aws-root' }),
    ).toHaveAttribute('href', `${BASE}/gazelle/aws-root`);
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it('asks for a muster session before describing the tool', async () => {
    mockAuthenticated = false;
    const api = await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets`,
    );

    expect(screen.getByText(/Tools need a muster session/)).toBeInTheDocument();
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it('says so when the server does not offer the tool on this installation', async () => {
    // The prefix is the server's, the tool is not in its list: a stale link,
    // or a tool the installation's server does not have.
    const api = await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_removed_tool`,
    );

    expect(
      await screen.findByText('No tool “x_aws-root_removed_tool” on gazelle'),
    ).toBeInTheDocument();
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it('describes a tool the truncated catalogue stops short of', async () => {
    const api = makeApi();
    api.filterTools.mockImplementation(async () => ({
      total: 2500,
      truncated: true,
      tools: [{ name: 'x_aws-root_list_buckets' }],
    }));
    await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_far_down_the_list`,
      api,
    );

    expect(
      await screen.findByText('List the buckets of the account.'),
    ).toBeInTheDocument();
    expect(api.describeTool).toHaveBeenCalledWith(
      'x_aws-root_far_down_the_list',
      'gazelle',
    );
  });
});

describe('ToolPage usage', () => {
  const usageSection = () =>
    screen.findByRole('region', { name: 'Usage in the last 30 days' });

  it("shows the tool's calls, errors and p95 from its connector's usage", async () => {
    const api = await renderAt(
      `${BASE}/gazelle/jira/tools/x_jira_search_issues`,
    );

    const section = await usageSection();
    expect(within(section).getByText('Calls')).toBeInTheDocument();
    expect(within(section).getByText('1,250')).toBeInTheDocument();
    expect(within(section).getByText('7')).toBeInTheDocument();
    expect(within(section).getByText('420 ms')).toBeInTheDocument();
    expect(
      within(section).getByRole('link', { name: 'All usage of jira' }),
    ).toHaveAttribute('href', '/customize/connectors/gazelle/jira/usage');
    // The read its connector's Usage tab makes, so it is cached there.
    expect(api.getMcpUsage).toHaveBeenCalledWith({
      installation: 'gazelle',
      hours: 720,
      servers: ['jira'],
    });
  });

  it('shows zeros for a tool nobody called', async () => {
    await renderAt(`${BASE}/gazelle/jira/tools/x_jira_add_comment`);

    const section = await usageSection();
    expect(within(section).getAllByText('0')).toHaveLength(2);
    expect(within(section).getByText('—')).toBeInTheDocument();
  });

  it('reads no usage for a tool its connector does not offer', async () => {
    const api = await renderAt(`${BASE}/gazelle/jira/tools/x_jira_gone`);

    expect(
      await screen.findByText('No tool “x_jira_gone” on gazelle'),
    ).toBeInTheDocument();
    expect(api.getMcpUsage).not.toHaveBeenCalled();
  });

  it("has none for muster's own tools, which no connector counts", async () => {
    const api = await renderAt(
      `${BASE}/gazelle/muster/tools/core_service_list`,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: /service_list/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Usage in the last 30 days' }),
    ).toBeNull();
    expect(api.getMcpUsage).not.toHaveBeenCalled();
  });
});

describe('ToolPage at phone width', () => {
  let layout: ReturnType<typeof mockPhoneLayout>;
  beforeEach(() => {
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it("leads its Connectors crumb to the sub-tab that lists the tool's connector", async () => {
    await renderAt(`${BASE}/gazelle/muster/tools/core_service_list`);
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'Connectors' },
      ),
    ).toHaveAttribute('href', '/customize/connectors/internal');
  });

  it('is a shell page: the tool as its h1, the trail under Customize, the full name in the header', async () => {
    await renderAt(`${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets`);

    expect(
      screen.getByRole('heading', { level: 1, name: 'list_buckets' }),
    ).toBeInTheDocument();
    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(trail)
        .getAllByRole('link')
        .map(link => [
          // The back arrow has no text, only its label.
          link.textContent || link.getAttribute('aria-label'),
          link.getAttribute('href'),
        ]),
    ).toEqual([
      ['Back to aws-root', `${BASE}/gazelle/aws-root`],
      ['Customize', '/customize'],
      ['Connectors', '/customize/connectors'],
      // One link to the connector: no "Tools" crumb repeating it.
      ['aws-root', `${BASE}/gazelle/aws-root`],
    ]);
    // The unbroken snake_case name may break anywhere instead of widening
    // the page.
    const name = screen.getByText('x_aws-root_list_buckets');
    expect(name.parentElement).toHaveTextContent(
      'Exposed by muster as: x_aws-root_list_buckets',
    );
    expect(name).toHaveStyle({ fontFamily: 'monospace' });
    expect(name.getAttribute('style')).toContain('overflow-wrap: anywhere');
    expect(
      await screen.findByText('List the buckets of the account.'),
    ).toBeInTheDocument();
  });
});
