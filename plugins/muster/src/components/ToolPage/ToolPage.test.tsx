import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
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

const BASE = '/agent-platform/muster/servers';

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
      screen.getByRole('heading', { name: 'list_buckets' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('x_aws-root_list_buckets').parentElement,
    ).toHaveTextContent('Exposed by muster as: x_aws-root_list_buckets');
    expect(
      await screen.findByText('List the buckets of the account.'),
    ).toBeInTheDocument();
    expect(screen.getByText('read-only')).toBeInTheDocument();
    expect(screen.getByText('Input schema')).toBeInTheDocument();

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(trail)
        .getAllByRole('link')
        .map(link => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['MCP Servers', `${BASE}?installation=gazelle`],
      ['aws-root', `${BASE}/aws-root?installation=gazelle`],
      ['Tools', `${BASE}/aws-root/tools?installation=gazelle`],
    ]);

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
    ).toHaveAttribute('href', `${BASE}/aws-root/tools?installation=gazelle`);
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it('asks for a muster session before describing the tool', async () => {
    mockAuthenticated = false;
    const api = await renderAt(
      `${BASE}/aws-root/tools/x_aws-root_list_buckets?installation=gazelle`,
    );

    expect(
      screen.getByText(/described and run through the muster session/),
    ).toBeInTheDocument();
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
});
