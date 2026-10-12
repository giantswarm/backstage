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
      total: 1,
      tools: [{ name: 'x_aws-root_list_buckets' }],
    })),
    describeTool: jest.fn(async (name: string) => ({
      name,
      description: 'List the buckets of the account.',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: { region: { type: 'string', description: 'AWS region' } },
      },
    })),
    callTool: jest.fn(async () => ({ buckets: ['logs'] })),
  };
}

const BASE = '/agent-platform/connectors';

async function renderAt(path: string, api = makeApi()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <PageHeaderActionsProvider>
        <Routes>
          <Route
            path="/agent-platform/connectors/*"
            element={<McpServersRouter />}
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: {
        '/agent-platform/connectors': mcpServersRouteRef,
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
      `${BASE}/aws-root/tools/x_aws-root_list_buckets?installation=gazelle`,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: 'list_buckets' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText('List the buckets of the account.'),
    ).toBeInTheDocument();
    // Once, beside the title: the panel shows no markers of its own.
    expect(screen.getAllByText('read-only')).toHaveLength(1);
    expect(screen.getByText('Input schema')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Execute' }));
    expect(await screen.findByText('Result')).toBeInTheDocument();
    expect(api.callTool).toHaveBeenCalledWith(
      'x_aws-root_list_buckets',
      {},
      'gazelle',
    );
  });

  it('does not show a tool under a server that does not offer it', async () => {
    const api = await renderAt(
      `${BASE}/aws-root/tools/x_kubernetes_get_pods?installation=gazelle`,
    );

    expect(
      await screen.findByText('No tool “x_kubernetes_get_pods” on gazelle'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the tools of aws-root' }),
    ).toHaveAttribute('href', `${BASE}/aws-root?installation=gazelle`);
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it('asks for a muster session before describing the tool', async () => {
    mockAuthenticated = false;
    const api = await renderAt(
      `${BASE}/aws-root/tools/x_aws-root_list_buckets?installation=gazelle`,
    );

    expect(screen.getByText(/Tools need a muster session/)).toBeInTheDocument();
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it('says so when the server does not offer the tool on this installation', async () => {
    // The prefix is the server's, the tool is not in its list: a stale link,
    // or a tool the installation's server does not have.
    const api = await renderAt(
      `${BASE}/aws-root/tools/x_aws-root_removed_tool?installation=gazelle`,
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
      `${BASE}/aws-root/tools/x_aws-root_far_down_the_list?installation=gazelle`,
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

describe('ToolPage at phone width', () => {
  let layout: ReturnType<typeof mockPhoneLayout>;
  beforeEach(() => {
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('is a shell page: the tool as its h1, the trail under Customize, the full name in the header', async () => {
    await renderAt(
      `${BASE}/aws-root/tools/x_aws-root_list_buckets?installation=gazelle`,
    );

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
      ['Back to aws-root', `${BASE}/aws-root?installation=gazelle`],
      ['Customize', '/customize'],
      ['Connectors', '/customize/connectors'],
      // One link to the connector: no "Tools" crumb repeating it.
      ['aws-root', `${BASE}/aws-root?installation=gazelle`],
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
