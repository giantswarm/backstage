import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { mockPhoneLayout } from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { type McpUsage, musterApiRef, type ToolDetail } from '../../apis';
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
let mockLoading = false;
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
    isLoading: mockLoading,
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
      total: 4,
      tools: [
        { name: 'core_service_list' },
        { name: 'x_aws-root_list_buckets' },
        { name: 'x_jira_search_issues' },
        { name: 'x_jira_add_comment' },
      ],
    })),
    describeTool: jest.fn(async (name: string): Promise<ToolDetail> => ({
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
    getMcpUsage: jest.fn(async (): Promise<McpUsage> => ({
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
  mockLoading = false;
  window.localStorage.clear();
});

/** The title block: the h1 and the badges beside it. */
const pageHeader = () =>
  screen.getByRole('heading', { level: 1 }).parentElement!;

describe('ToolPage', () => {
  it('opens on Overview: what it is for, its facts and its schema, folded', async () => {
    await renderAt(`${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets`);

    expect(
      screen.getByRole('heading', { level: 1, name: 'list_buckets' }),
    ).toBeInTheDocument();
    // The workflow page's tabs and order, without Details.
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Run it',
      'Usage',
    ]);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      within(
        await screen.findByRole('region', { name: 'What it’s for' }),
      ).getByText('List the buckets of the account.'),
    ).toBeInTheDocument();

    const facts = screen.getByRole('region', { name: 'Tool details' });
    expect(
      within(facts).getByRole('link', { name: 'aws-root' }),
    ).toHaveAttribute('href', `${BASE}/gazelle/aws-root`);
    expect(within(facts).getByText('Exposed by muster as')).toBeInTheDocument();
    expect(within(facts).getByText('Only reads')).toBeInTheDocument();

    // Mounted only once opened, as the other pages' Technical details are.
    expect(
      screen.getByRole('button', { name: 'Input schema' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/"AWS region"/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Input schema' }));
    expect(await screen.findByText(/"AWS region"/)).toBeInTheDocument();

    // Once, beside the title, as the Tools list's row says it.
    expect(within(pageHeader()).getByText('Reads')).toBeInTheDocument();
    // Running it is on Run it.
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
  });

  it('says so when the connector gives the tool no description', async () => {
    const api = makeApi();
    api.describeTool.mockImplementation(async (name: string) => ({
      name,
      annotations: {},
    }));
    await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets`,
      api,
    );

    expect(
      within(
        await screen.findByRole('region', { name: 'What it’s for' }),
      ).getByText('Its connector gives no description.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('None declared, so it counts as changing things'),
    ).toBeInTheDocument();
  });

  it('runs the tool on Run it', async () => {
    const api = await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets/run`,
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Try it' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Run it' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // Overview says what it is for and shows the schema.
    expect(screen.queryByRole('region', { name: 'What it’s for' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Input schema' })).toBeNull();
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
    await renderAt(`${BASE}/gazelle/jira/tools/x_jira_search_issues/run`);
    expect(
      await screen.findByText('Runs as you. Nothing is changed.'),
    ).toBeInTheDocument();
  });

  it('does not promise that a tool which changes things changes nothing', async () => {
    await renderAt(`${BASE}/gazelle/jira/tools/x_jira_add_comment/run`);
    expect(await screen.findByText('Runs as you.')).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is changed/)).not.toBeInTheDocument();
    // The Tools list's word for it, never the server's "destructive".
    expect(
      within(pageHeader()).getByText('Changes things'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/destructive/i)).not.toBeInTheDocument();
  });

  it('keeps the Tools search and filter it was opened from on every tab', async () => {
    await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets/run?q=list&effect=reads`,
    );
    const toolsHref = `${BASE}/gazelle/aws-root?q=list&effect=reads`;
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'aws-root' },
      ),
    ).toHaveAttribute('href', toolsHref);

    await screen.findByRole('heading', { level: 2, name: 'Try it' });
    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(
      await screen.findByRole('region', { name: 'What it’s for' }),
    ).toBeInTheDocument();
    // The crumb, from Overview too.
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'aws-root' },
      ),
    ).toHaveAttribute('href', toolsHref);
  });

  it('lands an address the page does not have on Overview, keeping its query', async () => {
    await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets/details?q=list`,
    );

    expect(
      await screen.findByRole('region', { name: 'What it’s for' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'aws-root' },
      ),
    ).toHaveAttribute('href', `${BASE}/gazelle/aws-root?q=list`);
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
    // No tabs for a tool that is not there.
    expect(screen.queryByRole('tab')).toBeNull();
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it('asks for a muster session before describing the tool', async () => {
    mockAuthenticated = false;
    const api = await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets/run`,
    );

    expect(screen.getByText(/Tools need a muster session/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
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

  describe('while a run is in flight', () => {
    /** Starts a run on Run it that does not return. */
    async function startRun() {
      const api = makeApi();
      api.callTool.mockImplementation(() => new Promise(() => {}));
      await renderAt(
        `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets/run`,
        api,
      );
      const form = await screen.findByRole('region', { name: 'Try it' });
      await userEvent.click(within(form).getByRole('button', { name: 'Run' }));
      await within(form).findByRole('button', { name: /Running/ });
      return api;
    }

    it('keeps the run and its result across a tab switch, without asking', async () => {
      await startRun();

      await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
      expect(
        await screen.findByRole('region', { name: 'What it’s for' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();

      await userEvent.click(screen.getByRole('tab', { name: 'Run it' }));
      expect(
        within(await screen.findByRole('region', { name: 'Try it' })).getByRole(
          'button',
          { name: /Running/ },
        ),
      ).toBeInTheDocument();
    });

    it('asks before following a link out of the page', async () => {
      await startRun();

      await userEvent.click(
        within(
          screen.getByRole('navigation', { name: 'Breadcrumb' }),
        ).getByRole('link', { name: 'Connectors' }),
      );
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText('Leave while the tool runs?'),
      ).toBeInTheDocument();
      expect(dialog).toHaveTextContent('shows only here');
      // Still here, behind the modal dialog.
      expect(
        screen.getByRole('region', { name: 'Try it', hidden: true }),
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Stay' }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(
        within(screen.getByRole('region', { name: 'Try it' })).getByRole(
          'button',
          { name: /Running/ },
        ),
      ).toBeInTheDocument();
    });

    it('has the browser ask before a reload or a closed tab', async () => {
      await startRun();

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it('keeps what was typed and the last result across a tab switch', async () => {
    await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets/run`,
    );
    const form = await screen.findByRole('region', { name: 'Try it' });
    await userEvent.click(within(form).getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { level: 2, name: 'Result' });
    // Typed after the run, so not yet remembered as its last-used value.
    await userEvent.type(
      within(form).getByRole('textbox', { name: /region/i }),
      'eu-west-1',
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    await screen.findByRole('region', { name: 'What it’s for' });
    await userEvent.click(screen.getByRole('tab', { name: 'Run it' }));

    expect(await screen.findByRole('textbox', { name: /region/i })).toHaveValue(
      'eu-west-1',
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'Result' }),
    ).toBeInTheDocument();
  });

  it('lets the page go without asking once no run is in flight', async () => {
    await renderAt(
      `${BASE}/gazelle/aws-root/tools/x_aws-root_list_buckets/run`,
    );
    await screen.findByRole('region', { name: 'Try it' });

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    await userEvent.click(screen.getByRole('tab', { name: 'Overview' }));
    expect(
      await screen.findByRole('region', { name: 'What it’s for' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('ToolPage usage', () => {
  /** A tile's text, as the connector's Usage tab test reads it. */
  const stat = (label: string) =>
    screen.getByText(label).closest('[class*="root"]')?.textContent ?? '';

  it('reads no usage until the Usage tab is open', async () => {
    const api = await renderAt(
      `${BASE}/gazelle/jira/tools/x_jira_search_issues`,
    );

    await screen.findByRole('region', { name: 'What it’s for' });
    expect(api.getMcpUsage).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    expect(await screen.findByText('Tool calls')).toBeInTheDocument();
    expect(api.getMcpUsage).toHaveBeenCalledTimes(1);
  });

  it("shows the tool's own calls, errors and p95, read for the tool alone", async () => {
    const api = await renderAt(
      `${BASE}/gazelle/jira/tools/x_jira_search_issues/usage`,
    );

    expect(await screen.findByText('Tool calls')).toBeInTheDocument();
    expect(api.getMcpUsage).toHaveBeenCalledWith({
      installation: 'gazelle',
      hours: 720,
      servers: ['jira'],
      tool: 'x_jira_search_issues',
    });
    expect(stat('Tool calls')).toContain('1,250');
    expect(stat('Error ratio')).toContain('1%');
    expect(stat('p95 latency')).toContain('420 ms');
    expect(
      screen.getByRole('link', { name: 'All usage of jira' }),
    ).toHaveAttribute('href', '/customize/connectors/gazelle/jira/usage');
  });

  it('covers the window the connector’s Usage tab linked with, and keeps it on the way back', async () => {
    const api = await renderAt(
      `${BASE}/gazelle/jira/tools/x_jira_search_issues/usage?window=7d`,
    );

    expect(
      await screen.findByText(
        "Every caller's calls to this tool over the last 7 days on gazelle.",
      ),
    ).toBeInTheDocument();
    expect(api.getMcpUsage).toHaveBeenCalledWith({
      installation: 'gazelle',
      hours: 168,
      servers: ['jira'],
      tool: 'x_jira_search_issues',
    });
    expect(
      screen.getByRole('link', { name: 'All usage of jira' }),
    ).toHaveAttribute(
      'href',
      '/customize/connectors/gazelle/jira/usage?window=7d',
    );
  });

  it('says so when nobody called the tool', async () => {
    const api = makeApi();
    api.getMcpUsage.mockImplementation(async () => ({
      available: true,
      range_hours: 720,
      step_hours: 24,
      buckets: [],
      totals: {
        calls: 0,
        errors: 0,
        error_ratio: null,
        p95_seconds: null,
        distinct_tools: 0,
      },
      top_tools: [],
      servers: [],
    }));
    await renderAt(`${BASE}/gazelle/jira/tools/x_jira_add_comment/usage`, api);

    expect(
      await screen.findByText('No calls in the last 30 days'),
    ).toBeInTheDocument();
  });

  it('says so where the environment has no usage metrics', async () => {
    const api = makeApi();
    api.getMcpUsage.mockImplementation(async () => ({
      available: false,
      reason: 'No prometheus MCP server is registered.',
      range_hours: 720,
      step_hours: 24,
      buckets: [],
      totals: {
        calls: 0,
        errors: 0,
        error_ratio: null,
        p95_seconds: null,
        distinct_tools: 0,
      },
      top_tools: [],
      servers: [],
    }));
    await renderAt(`${BASE}/gazelle/jira/tools/x_jira_add_comment/usage`, api);

    expect(
      await screen.findByText(/Usage metrics are not available/),
    ).toBeInTheDocument();
  });

  it("draws muster's tool's tabs without Usage while the connectors are read", async () => {
    mockLoading = true;
    await renderAt(`${BASE}/gazelle/muster/tools/core_service_list`);

    // Still reading: no tab has content yet.
    expect(screen.queryByRole('region', { name: 'What it’s for' })).toBeNull();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Run it',
    ]);
  });

  it("has no Usage tab for muster's own tools, which no connector counts", async () => {
    const api = await renderAt(
      `${BASE}/gazelle/muster/tools/core_service_list/usage`,
    );

    // The address lands on Overview.
    expect(
      await screen.findByRole('region', { name: 'What it’s for' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Run it',
    ]);
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
