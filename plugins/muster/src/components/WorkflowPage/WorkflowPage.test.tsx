import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
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

const FAILED_RUN_DETAIL = {
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
};

// The newest run: the canvas overlays its per-step records.
const COMPLETED_RUN_DETAIL = {
  execution_id: 'run-1',
  workflow_name: 'deploy',
  status: 'completed' as const,
  started_at: '2026-10-09T08:00:00Z',
  duration_ms: 18000,
  steps: [
    {
      step_id: 'fetch',
      tool: 'x_kubernetes_get_pods',
      status: 'completed' as const,
      started_at: '2026-10-09T08:00:00Z',
      duration_ms: 1200,
    },
    {
      step_id: 'apply',
      tool: 'x_kubernetes_apply',
      status: 'skipped' as const,
      started_at: '2026-10-09T08:00:01Z',
      duration_ms: 0,
    },
    {
      step_id: 'probe',
      tool: 'core_service_list',
      status: 'completed' as const,
      started_at: '2026-10-09T08:00:02Z',
      duration_ms: 0,
    },
    {
      step_id: 'probe',
      tool: 'core_service_list',
      status: 'completed' as const,
      started_at: '2026-10-09T08:00:03Z',
      duration_ms: 0,
    },
  ],
};

function makeApi() {
  return {
    describeTool: jest.fn(async (name: string) => ({
      name,
      description: 'Runs the workflow.',
      annotations: { readOnlyHint: true },
    })),
    listExecutions: jest.fn(async (options: { status?: string }) => {
      // Per-status totals: muster's own counts, read off a one-row page.
      if (options.status) {
        return {
          executions: [],
          total: options.status === 'completed' ? 1200 : 34,
          limit: 1,
          offset: 0,
          has_more: true,
        };
      }
      return {
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
        total: 1234,
        limit: 5,
        offset: 0,
        has_more: true,
      };
    }),
    getExecution: jest.fn(async (id: string) =>
      id === 'run-1' ? COMPLETED_RUN_DETAIL : FAILED_RUN_DETAIL,
    ),
    filterTools: jest.fn(async () => ({
      total: 2,
      filtered_count: 2,
      truncated: false,
      tools: [
        {
          name: 'x_kubernetes_get_pods',
          annotations: { readOnlyHint: true },
        },
        { name: 'x_kubernetes_apply', annotations: { readOnlyHint: false } },
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

  it('draws the flow — spine, gate, loop group, cleanup lane — as the only step view, with no branches or trigger', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const figure = screen.getByTestId('workflow-flow-canvas');
    const canvas = within(figure);

    expect(
      screen.getByRole('group', {
        name: "Flow of the workflow's 3 steps and its cleanup steps",
      }),
    ).toBeInTheDocument();
    // Each step is a button naming its place, tool and gate.
    expect(
      canvas.getByRole('button', {
        name: /^Step 1: Read the current pods, kubernetes · get_pods/,
      }),
    ).toBeInTheDocument();
    expect(
      canvas.getByRole('button', {
        name: /^Step 2: Apply the manifests, kubernetes · apply, Only if step 1 \(fetch\) succeeded/,
      }),
    ).toBeInTheDocument();
    // The condition is drawn as a gate on the edge into step 2, not a fork.
    expect(figure.querySelector('[data-gate-for="s1"]')).toHaveTextContent(
      'Only if step 1 (fetch) succeeded',
    );
    expect(canvas.queryByText(/^(yes|no)$/i)).toBeNull();
    // The forEach step is a group around its body step.
    const loop = figure.querySelector('[data-group="forEach"]');
    expect(loop).toHaveTextContent('Check every cluster');
    expect(loop).toHaveTextContent('For each cluster in the input “clusters”');
    expect(
      canvas.getByRole('button', { name: /^Step 3\.1: Probe it/ }),
    ).toBeInTheDocument();
    // The cleanup steps are their own lane.
    expect(figure.querySelector('[data-group="onFailure"]')).toHaveTextContent(
      'If it fails',
    );
    expect(
      canvas.getByRole('button', { name: /^Cleanup step: Roll back/ }),
    ).toBeInTheDocument();
    // Nothing muster does not have.
    expect(canvas.queryByText(/schedule|trigger|next run|version/i)).toBeNull();
    // No duplicate step list under the canvas, no page-wide toggle.
    expect(screen.queryByTestId('workflow-step-list')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    // Plain level: the exact tool name appears nowhere until asked for.
    expect(screen.queryByText('x_kubernetes_get_pods')).toBeNull();
  });

  it('caps the canvas viewport so a long workflow scrolls inside its box', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const viewport = screen.getByTestId('workflow-flow-viewport');

    expect(getComputedStyle(viewport).overflow).toBe('auto');
  });

  it('opens a step’s plain details on click, with its own technical fold-out', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const step = screen.getByRole('button', {
      name: /^Step 2: Apply the manifests/,
    });

    await userEvent.click(step);
    expect(step).toHaveAttribute('aria-pressed', 'true');
    const details = within(screen.getByTestId('workflow-step-details'));
    expect(
      details.getByRole('heading', { name: 'Step 2 · Apply the manifests' }),
    ).toBeInTheDocument();
    expect(
      details.getByText(/on the kubernetes connector/),
    ).toBeInTheDocument();
    expect(
      details.getByText(
        'Only if step 1 (fetch) succeeded — otherwise this step is skipped.',
      ),
    ).toBeInTheDocument();
    // Technical fields stay folded until this step's fold-out opens.
    expect(details.queryByText('x_kubernetes_apply')).toBeNull();
    await userEvent.click(
      details.getByRole('button', { name: 'Show technical information' }),
    );
    expect(details.getByText('x_kubernetes_apply')).toBeInTheDocument();
    expect(details.getByText('fromStep: fetch')).toBeInTheDocument();
    expect(details.getByText('expect: success=true')).toBeInTheDocument();

    // Another step replaces the details, folded again; Close closes them.
    await userEvent.click(
      screen.getByRole('button', { name: /^Step 1: Read the current pods/ }),
    );
    const first = within(screen.getByTestId('workflow-step-details'));
    expect(
      first.getByRole('heading', { name: 'Step 1 · Read the current pods' }),
    ).toBeInTheDocument();
    expect(first.queryByText('{{ .input.app }}')).toBeNull();
    await userEvent.click(
      first.getByRole('button', { name: 'Show technical information' }),
    );
    expect(first.getByText('{{ .input.app }}')).toBeInTheDocument();
    expect(
      first.getByText('stores its result for later steps'),
    ).toBeInTheDocument();
    await userEvent.click(first.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('workflow-step-details')).toBeNull();
  });

  it('opens a group head’s details: what the loop runs over', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    await userEvent.click(
      screen.getByRole('button', { name: /^Step 3: Check every cluster/ }),
    );
    const details = within(screen.getByTestId('workflow-step-details'));
    expect(
      details.getByText(
        'For each cluster in the input “clusters”, it runs its 1 step in order.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      details.getByRole('button', { name: 'Show technical information' }),
    );
    expect(details.getByText('{{ .input.clusters }}')).toBeInTheDocument();
  });

  it('colours the nodes with the latest run and marks what each step does', async () => {
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);
    const figure = screen.getByTestId('workflow-flow-canvas');

    expect(
      await within(figure).findByText(
        /^Last run .* · Succeeded — each step shows how it went\. Select a step to see its details\.$/,
      ),
    ).toBeInTheDocument();
    expect(api.getExecution).toHaveBeenCalledWith('run-1', 'gazelle');

    const node = (key: string) =>
      figure.querySelector(`[data-step-key="${key}"]`) as HTMLElement;
    await waitFor(() =>
      expect(node('s0')).toHaveAttribute('data-run-status', 'completed'),
    );
    expect(node('s0')).toHaveTextContent('✓ 1.2s');
    expect(node('s1')).toHaveAttribute('data-run-status', 'skipped');
    expect(node('s1')).toHaveTextContent('Skipped');
    // Two loop iterations, no recorded duration: a count, no made-up time.
    expect(node('s2.0')).toHaveTextContent('✓ ×2');
    expect(node('s2.0')).not.toHaveTextContent(/\d+ms|\d+\.\ds/);
    // The cleanup lane did not run.
    expect(node('f0')).toHaveAttribute('data-run-status', 'notRun');

    // Read/write accents from the tool catalogue's annotations.
    await waitFor(() => expect(node('s0')).toHaveTextContent('Reads'));
    expect(node('s1')).toHaveTextContent('Changes things');
    expect(node('f0')).not.toHaveTextContent(/Reads|Changes things/);

    // The step's details say how its last run went.
    await userEvent.click(node('s1'));
    expect(
      within(screen.getByTestId('workflow-step-details')).getByText(
        'Last run: skipped — its condition did not hold.',
      ),
    ).toBeInTheDocument();
  });

  it('lists only the latest few runs and puts the totals in the details panel', async () => {
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(
      await screen.findByText('1,200 succeeded · 34 failed'),
    ).toBeInTheDocument();
    expect(api.listExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', limit: 1 }),
    );
    expect(api.listExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', limit: 1 }),
    );
    expect(api.listExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ workflowName: 'deploy', limit: 5 }),
    );
    expect(
      screen.getByText(/The newest 2 of 1,234 recorded runs\./),
    ).toBeInTheDocument();
  });

  it('names the failed step in a run’s trace, with the record behind its own fold-out', async () => {
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
    expect(screen.queryByText(/"execution_id": "run-2"/)).toBeNull();
    const folds = screen.getAllByRole('button', {
      name: 'Show technical information',
    });
    await userEvent.click(folds[folds.length - 1]);
    expect(
      await screen.findByText(/"execution_id": "run-2"/),
    ).toBeInTheDocument();
  });

  it('shows the raw definition behind its own fold-out', async () => {
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(api.getWorkflow).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole('button', { name: 'Show the raw definition' }),
    );
    const editor = await screen.findByRole('textbox', {
      name: 'Definition (YAML)',
    });
    expect(editor).toHaveValue('name: deploy\nsteps: []\n');
    expect(api.getWorkflow).toHaveBeenCalledWith('deploy', 'gazelle');
  });

  it('offers no run, create, edit or delete affordances — the page is read-only (D11)', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    // Anchored: step buttons may name a tool such as kubernetes · delete.
    expect(screen.queryByRole('button', { name: /^edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^create/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^run/i })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Run' })).toBeNull();
  });

  it('asks for a muster session instead of claiming runs or a badge, and still draws the definition', async () => {
    mockAuthenticated = false;
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(
      screen.getByText(
        /Run history, statistics and the read-only badge are read through your muster session/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Only reads')).toBeNull();
    expect(screen.queryByText(/succeeded ·/)).toBeNull();
    expect(api.listExecutions).not.toHaveBeenCalled();
    expect(api.describeTool).not.toHaveBeenCalled();
    expect(api.filterTools).not.toHaveBeenCalled();
    // The CR-backed flow still renders, without a run overlay.
    const figure = screen.getByTestId('workflow-flow-canvas');
    expect(
      within(figure).getByRole('button', {
        name: /^Step 1: Read the current pods/,
      }),
    ).toBeInTheDocument();
    expect(figure.querySelector('[data-run-status]')).toBeNull();
    expect(within(figure).queryByText(/Last run/)).toBeNull();
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
