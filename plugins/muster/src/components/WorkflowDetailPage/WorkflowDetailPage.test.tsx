import { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { musterApiRef } from '../../apis';
import { workflowsRouteRef } from '../../routes';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { WorkflowsRouter } from '../WorkflowsRouter';

let mockHeaderActions: ReactNode = null;
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: (element: ReactNode) => {
    mockHeaderActions = element;
  },
}));

const DEPLOY = new MusterWorkflow(
  {
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'Workflow',
    metadata: { name: 'deploy', namespace: 'muster' },
    spec: {
      description: 'Deploys an app.',
      args: { app: { type: 'string', required: true } },
      steps: [
        { id: 'apply', tool: 'x_kubernetes_apply' },
        { id: 'roster', tool: 'x_agent-manager_list_agents' },
      ],
    },
    status: { valid: true },
  } as never,
  'gazelle',
);

function mcpServer(name: string): MCPServer {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace: 'muster' },
      spec: { type: 'streamable-http' },
      status: { state: 'Connected' },
    } as never,
    'gazelle',
  );
}

const SERVERS = [
  mcpServer('kubernetes'),
  mcpServer('agent-manager'),
  mcpServer('miro'),
];

let mockAuthenticated = true;
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    activeInstallationInfo: { name: 'gazelle', requiresAuth: true },
    mcpServers: SERVERS,
    workflows: [DEPLOY],
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

function makeApi(
  authStatus: { name: string; status: string }[] = [
    { name: 'kubernetes', status: 'connected' },
    { name: 'agent-manager', status: 'connected' },
  ],
) {
  return {
    getAuthStatus: jest.fn(async () => ({ servers: authStatus })),
    getWorkflowStats: jest.fn(async () => ({
      workflow_name: 'deploy',
      runs: 1,
      sampled: 1,
      completed: 0,
      failed: 1,
      inprogress: 0,
      success_rate: 0,
      avg_duration_ms: 1200,
      max_duration_ms: 1200,
      per_day: [],
    })),
    describeTool: jest.fn(async (name: string) => ({
      name,
      description: 'Deploys an app.',
      inputSchema: {
        type: 'object',
        properties: { app: { type: 'string', description: 'The app' } },
        required: ['app'],
      },
    })),
    callTool: jest.fn(async () => ({ deployed: true })),
  };
}

const BASE = '/agent-platform/workflows';

function CurrentPath() {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{`${pathname}${search}`}</div>;
}

async function renderAt(path: string, api = makeApi()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route
          path="/agent-platform/workflows/*"
          element={
            <>
              <WorkflowsRouter />
              <CurrentPath />
            </>
          }
        />
      </Routes>
    </QueryClientProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/workflows': workflowsRouteRef },
      apis: [[musterApiRef, api as never]],
    },
  );
  return api;
}

beforeEach(() => {
  mockAuthenticated = true;
  mockHeaderActions = null;
  window.localStorage.clear();
});

describe('WorkflowDetailPage', () => {
  it('opens on Overview, with tabs that keep the installation', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(
      screen
        .getAllByRole('tab')
        .map(tab => [tab.textContent, tab.getAttribute('href')]),
    ).toEqual([
      ['Overview', `${BASE}/deploy?installation=gazelle`],
      ['Run', `${BASE}/deploy/run?installation=gazelle`],
    ]);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Overview',
    );
    expect(screen.getByText('Statistics')).toBeInTheDocument();
    expect(screen.getByText('Steps')).toBeInTheDocument();
    // The Run tab replaces the old button out of the page.
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();

    const trail = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(trail)
        .getAllByRole('link')
        .map(link => [link.textContent, link.getAttribute('href')]),
    ).toEqual([['Workflows', `${BASE}?installation=gazelle`]]);
  });

  it('runs the workflow tool on the Run tab', async () => {
    const api = await renderAt(`${BASE}/deploy/run?installation=gazelle`);

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Run',
    );
    await userEvent.type(
      await screen.findByRole('textbox', { name: /app/i }),
      'shop',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Execute' }));

    expect(await screen.findByText('Result')).toBeInTheDocument();
    expect(api.callTool).toHaveBeenCalledWith(
      'workflow_deploy',
      expect.objectContaining({ app: 'shop' }),
      'gazelle',
    );
  });

  it('names the servers the workflow calls that wait for a sign-in', async () => {
    await renderAt(
      `${BASE}/deploy/run?installation=gazelle`,
      makeApi([
        { name: 'kubernetes', status: 'connected' },
        { name: 'agent-manager', status: 'auth_required' },
        // Not called by the workflow, so not its concern.
        { name: 'miro', status: 'auth_required' },
      ]),
    );

    expect(
      await screen.findByText('Authentication required'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/calls tools of a server you are not signed in to/),
    ).toBeInTheDocument();
    expect(screen.getByText('agent-manager')).toBeInTheDocument();
    expect(screen.queryByText('miro')).toBeNull();
    expect(screen.getByRole('button', { name: /Sign in/ })).toBeInTheDocument();
  });

  it('says nothing about sign-ins when every server the workflow calls is signed in to', async () => {
    const api = await renderAt(`${BASE}/deploy/run?installation=gazelle`);

    await screen.findByRole('button', { name: 'Execute' });
    expect(api.getAuthStatus).toHaveBeenCalled();
    expect(screen.queryByText('Authentication required')).toBeNull();
  });

  it('asks for a muster session before running', async () => {
    mockAuthenticated = false;
    const api = await renderAt(`${BASE}/deploy/run?installation=gazelle`);

    expect(
      screen.getByText(/A workflow is run through the muster session/),
    ).toBeInTheDocument();
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it("puts a manually-added workflow's Edit and Delete in the page header", async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    // Not repeated in the page: the header's actions say it is editable.
    expect(screen.queryByText('Manually added')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();

    await renderInTestApp(<>{mockHeaderActions}</>);
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    // The dialog is the page's, inside muster's providers.
    expect(
      await screen.findByRole('dialog', { name: /Delete deploy/ }),
    ).toBeInTheDocument();
  });

  it('sends an unknown tab back to Overview, keeping the installation', async () => {
    await renderAt(`${BASE}/deploy/nonsense?installation=gazelle`);

    expect(screen.getByTestId('path')).toHaveTextContent(
      `${BASE}/deploy?installation=gazelle`,
    );
  });

  it('says so, with a way back, for a workflow the installation lacks', async () => {
    await renderAt(`${BASE}/missing?installation=gazelle`);

    expect(
      screen.getByText('No workflow “missing” on gazelle'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the workflows' }),
    ).toHaveAttribute('href', `${BASE}?installation=gazelle`);
  });
});
