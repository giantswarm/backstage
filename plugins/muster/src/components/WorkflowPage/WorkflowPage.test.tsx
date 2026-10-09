import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { customizeExternalRouteRef, workflowsRouteRef } from '../../routes';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { WorkflowPage } from './WorkflowPage';

// A textarea stands in for the CodeMirror editor, so the raw-YAML assertion
// can read the definition as the textbox's value.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  YamlEditorFormField: ({
    value,
    label,
  }: {
    value: string;
    label?: string;
  }) => <textarea aria-label={label} value={value} readOnly />,
}));

let mockWorkflows: MusterWorkflow[] = [];
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
          metadata: { name: 'kubernetes', namespace: 'muster' },
          spec: { type: 'streamable-http' },
          status: { state: 'Connected' },
        } as never,
        'gazelle',
      ),
    ],
    workflows: mockWorkflows,
    isLoading: false,
  }),
  useMusterSession: () => ({
    authenticated: mockAuthenticated,
    pending: false,
    connecting: false,
    connect: jest.fn(),
  }),
}));

const DEPLOY = new MusterWorkflow(
  {
    apiVersion: 'muster.giantswarm.io/v1alpha1',
    kind: 'Workflow',
    metadata: {
      name: 'deploy',
      namespace: 'muster',
      creationTimestamp: '2026-08-04T10:00:00Z',
    },
    spec: {
      description: 'Deploys an app and tells the team.',
      args: {
        app: { type: 'string', required: true, description: 'The app name' },
        dryRun: { type: 'boolean', default: false },
      },
      steps: [
        {
          id: 'fetch',
          tool: 'x_kubernetes_get_pods',
          args: { namespace: '{{ .input.app }}' },
          description: 'Read the current pods',
          store: true,
        },
        {
          id: 'apply',
          tool: 'x_kubernetes_apply',
          condition: { fromStep: 'fetch', expect: { success: true } },
          description: 'Apply the manifests',
        },
        {
          id: 'fanout',
          description: 'Check every cluster',
          forEach: {
            items: '{{ .input.clusters }}',
            as: 'cluster',
            steps: [
              {
                id: 'probe',
                tool: 'core_service_list',
                description: 'Probe it',
              },
            ],
          },
        },
      ],
      onFailure: [
        {
          id: 'cleanup',
          tool: 'x_kubernetes_delete',
          description: 'Roll back',
        },
      ],
    },
    status: { valid: true, referencedTools: ['x_kubernetes_get_pods'] },
  } as never,
  'gazelle',
);

const FAILED_RUN = {
  execution_id: 'run-2',
  workflow_name: 'deploy',
  status: 'failed' as const,
  started_at: '2026-10-08T08:00:00Z',
  duration_ms: 2000,
  step_count: 2,
  error: 'apply refused',
};

function makeApi() {
  return {
    describeTool: jest.fn(async (name: string) => ({
      name,
      description: 'Runs the workflow.',
      annotations: { readOnlyHint: true },
    })),
    listExecutions: jest.fn(async () => ({
      executions: [
        {
          execution_id: 'run-1',
          workflow_name: 'deploy',
          status: 'completed' as const,
          started_at: '2026-10-09T08:00:00Z',
          duration_ms: 18000,
          step_count: 3,
        },
        FAILED_RUN,
      ],
      total: 2,
      limit: 10,
      offset: 0,
      has_more: false,
    })),
    getExecution: jest.fn(async () => ({
      ...FAILED_RUN,
      input: { app: 'shop' },
      steps: [
        {
          step_id: 'fetch',
          tool: 'x_kubernetes_get_pods',
          status: 'completed' as const,
          started_at: '2026-10-08T08:00:00Z',
          duration_ms: 1200,
        },
        {
          step_id: 'apply',
          tool: 'x_kubernetes_apply',
          status: 'failed' as const,
          started_at: '2026-10-08T08:00:02Z',
          duration_ms: 800,
          error: 'apply refused',
        },
      ],
    })),
    getWorkflowStats: jest.fn(async () => ({
      workflow_name: 'deploy',
      runs: 2,
      sampled: 2,
      completed: 1,
      failed: 1,
      inprogress: 0,
      success_rate: 0.5,
      avg_duration_ms: 10000,
      max_duration_ms: 18000,
      per_day: [],
    })),
    getWorkflow: jest.fn(async () => ({
      workflow: { name: 'deploy', steps: [] },
      yaml: 'name: deploy\nsteps: []\n',
    })),
  };
}

async function renderAt(path: string, api = makeApi()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <QueryClientProvider client={queryClient}>
      <PageHeaderActionsProvider>
        <Routes>
          <Route
            path="/agent-platform/workflows/:name/*"
            element={<WorkflowPage />}
          />
        </Routes>
      </PageHeaderActionsProvider>
    </QueryClientProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: {
        '/agent-platform/workflows': workflowsRouteRef,
        '/customize': customizeExternalRouteRef,
      },
      apis: [[musterApiRef, api as never]],
    },
  );
  return api;
}

const BASE = '/agent-platform/workflows';

beforeEach(() => {
  mockWorkflows = [DEPLOY];
  mockAuthenticated = true;
});

describe('WorkflowPage', () => {
  it('heads the page with its place under Customize, the honest badge and the description', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(
      screen.getByRole('heading', { level: 1, name: 'deploy' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Customize' })).toHaveAttribute(
      'href',
      '/customize',
    );
    expect(screen.getByRole('link', { name: 'Workflows' })).toHaveAttribute(
      'href',
      '/customize/workflows',
    );
    expect(await screen.findByText('Only reads')).toBeInTheDocument();
    expect(
      screen.getByText('Deploys an app and tells the team.'),
    ).toBeInTheDocument();
    // The derived hint comes off the tools endpoint, never the CR.
    expect(screen.getByText('workflow_deploy')).toBeInTheDocument();
  });

  it('lists the inputs with type, required and default', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(screen.getByText('app')).toBeInTheDocument();
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getByText('The app name')).toBeInTheDocument();
    expect(screen.getByText('dryRun')).toBeInTheDocument();
    expect(screen.getByText(/default:/)).toBeInTheDocument();
  });

  it('renders the steps plainly: descriptions, connector names, conditions, groups and the failure lane', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(screen.getByText('Read the current pods')).toBeInTheDocument();
    // Plain level names the connector and the short tool, not the exact name.
    expect(screen.getByText('get_pods')).toBeInTheDocument();
    expect(screen.queryByText('x_kubernetes_get_pods')).toBeNull();
    expect(
      screen.getByText('Only if step 1 (fetch) succeeded'),
    ).toBeInTheDocument();
    expect(screen.getByText(/For each item in/)).toBeInTheDocument();
    expect(screen.getByText('Probe it')).toBeInTheDocument();
    expect(screen.getByText('If it fails')).toBeInTheDocument();
    expect(screen.getByText('Roll back')).toBeInTheDocument();
  });

  it('shows exact tool names, templated args and the raw YAML behind the technical toggle', async () => {
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    await userEvent.click(
      screen.getByRole('switch', { name: 'Show technical details' }),
    );

    expect(screen.getAllByText('x_kubernetes_get_pods').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText('{{ .input.app }}')).toBeInTheDocument();
    expect(screen.getByText('Technical details')).toBeInTheDocument();
    const editor = await screen.findByRole('textbox', {
      name: 'Definition (YAML)',
    });
    expect(editor).toHaveValue('name: deploy\nsteps: []\n');
    expect(api.getWorkflow).toHaveBeenCalledWith('deploy', 'gazelle');
  });

  it('lists the recent runs and names the failed step in the trace', async () => {
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(await screen.findByText('Succeeded')).toBeInTheDocument();
    const failed = await screen.findByText('Failed');
    expect(screen.getByText('apply refused')).toBeInTheDocument();
    expect(
      screen.getByText(/muster keeps run records for about three weeks/),
    ).toBeInTheDocument();

    // Expanding the failed run fetches its per-step trace lazily.
    await userEvent.click(failed);
    expect(
      await screen.findByText('Failed at step 2 (apply): apply refused'),
    ).toBeInTheDocument();
    expect(api.getExecution).toHaveBeenCalledWith('run-2', 'gazelle');
    const trace = screen.getAllByText('apply');
    expect(trace.length).toBeGreaterThan(0);
  });

  it('offers no run, create, edit or delete affordances — the page is read-only (D11)', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /create/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^run/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Run' })).toBeNull();
  });

  it('asks for a muster session instead of claiming runs or a badge', async () => {
    mockAuthenticated = false;
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(
      screen.getByText(
        /Run history, statistics and the read-only badge are read through your muster session/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Only reads')).toBeNull();
    expect(api.listExecutions).not.toHaveBeenCalled();
    expect(api.describeTool).not.toHaveBeenCalled();
    // The CR-backed sections still render.
    expect(screen.getByText('Read the current pods')).toBeInTheDocument();
  });

  it('says so, with a way back, for a workflow the installation lacks', async () => {
    await renderAt(`${BASE}/missing?installation=gazelle`);

    expect(
      screen.getByText('No workflow “missing” on gazelle'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to the workflows' }),
    ).toHaveAttribute('href', '/customize/workflows');
  });
});
