import { Route, Routes } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  PageHeaderActionsProvider,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react';
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

  it('names the workflow in the document title', async () => {
    // Live round 2 (R5): the page set none, so a client-side visit kept the
    // previous page's title.
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    await waitFor(() =>
      expect(document.title).toBe('deploy · Workflows · Agent Platform'),
    );
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

  it('orders the sections: what it needs, how it runs, statistics, then one Advanced disclosure', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    const titles = [
      'What it needs',
      'How it runs',
      'Statistics',
      'Advanced',
    ].map(title => screen.getByText(title));
    for (let i = 1; i < titles.length; i++) {
      expect(
        // eslint-disable-next-line no-bitwise
        titles[i - 1].compareDocumentPosition(titles[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // No run list and no runs fact beside the page any more.
    expect(screen.queryByText('Recent runs')).toBeNull();
    expect(screen.queryByText(/older run/)).toBeNull();
    const facts = within(
      screen.getByRole('complementary', { name: 'Workflow details' }),
    );
    expect(facts.queryByText('Runs')).toBeNull();
    expect(screen.queryByText(/succeeded ·/)).toBeNull();
    // Where agents use it and the technical details wait inside Advanced.
    expect(screen.queryByText('Where agents use it')).toBeNull();
    expect(screen.queryByText('Technical details')).toBeNull();
  });

  it('puts the last run and muster’s run totals in Statistics', async () => {
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    const lastRun = await screen.findByTestId('workflow-last-run');
    expect(lastRun).toHaveTextContent('Last run');
    expect(lastRun).toHaveTextContent('Succeeded');
    expect(lastRun).toHaveTextContent('started 9 Oct 2026, 08:00 UTC');
    expect(lastRun).toHaveTextContent('took 18.0s');
    // The breakdown counts every recorded run (muster's per-status totals),
    // not the stats sample of two.
    expect(await screen.findByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(api.listExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', limit: 1 }),
    );
    expect(api.listExecutions).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', limit: 1 }),
    );
    // One newest-run read, shared with the canvas overlay.
    const unfiltered = api.listExecutions.mock.calls.filter(
      ([options]) => !options.status,
    );
    expect(unfiltered).toEqual([
      [expect.objectContaining({ workflowName: 'deploy', limit: 1 })],
    ]);
    expect(api.getWorkflowStats).toHaveBeenCalledWith('deploy', 'gazelle');
    expect(
      screen.getByText(/about three weeks, at most 10,000/),
    ).toBeInTheDocument();
  });

  it('names a failed last run’s error in Statistics', async () => {
    const api = makeApi();
    api.listExecutions.mockImplementation(
      async (options: { status?: string }) =>
        options.status
          ? { executions: [], total: 3, limit: 1, offset: 0, has_more: true }
          : {
              executions: [FAILED_RUN],
              total: 6,
              limit: 1,
              offset: 0,
              has_more: true,
            },
    );
    await renderAt(`${BASE}/deploy?installation=gazelle`, api);

    const lastRun = await screen.findByTestId('workflow-last-run');
    expect(lastRun).toHaveTextContent('Failed');
    expect(lastRun).toHaveTextContent('apply refused');
    expect(lastRun).toHaveTextContent('took 2.0s');
  });

  it('holds where agents use it and the technical details in one Advanced disclosure', async () => {
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(api.getWorkflow).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^Advanced/ }));

    expect(screen.getByText('Where agents use it')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Agents run this workflow by calling the tool workflow_deploy.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('No other workflow calls this one as a step.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Technical details')).toBeInTheDocument();
    // The raw definition is part of the technical details — no second fold.
    expect(
      screen.queryByRole('button', { name: 'Show the raw definition' }),
    ).toBeNull();
    const editor = await screen.findByRole('textbox', {
      name: 'Definition (YAML)',
    });
    expect(editor).toHaveValue('name: deploy\nsteps: []\n');
    expect(api.getWorkflow).toHaveBeenCalledWith('deploy', 'gazelle');
    expect(screen.getByText('x_kubernetes_get_pods')).toBeInTheDocument();
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
        /Statistics, the last run and the read-only badge need a muster session/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Only reads')).toBeNull();
    expect(
      screen.getByText(/Connect to muster above to see statistics/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-last-run')).toBeNull();
    expect(api.listExecutions).not.toHaveBeenCalled();
    expect(api.getWorkflowStats).not.toHaveBeenCalled();
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

/** A workflow of `count` plain steps, and a parallel group as its second. */
function longWorkflow(count: number): MusterWorkflow {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: { name: 'long', namespace: 'muster' },
      spec: {
        description: 'Many steps.',
        steps: Array.from({ length: count }, (_, i) =>
          i === 1
            ? {
                id: 'both',
                description: 'Check both regions',
                parallel: [
                  {
                    id: 'east',
                    tool: 'core_service_list',
                    description: 'East',
                  },
                  {
                    id: 'west',
                    tool: 'core_service_list',
                    description: 'West',
                  },
                ],
              }
            : {
                id: `step-${i + 1}`,
                tool: 'core_service_list',
                description: `Do thing ${i + 1}`,
              },
        ),
      },
      status: { valid: true },
    } as never,
    'gazelle',
  );
}

describe('WorkflowPage at phone width', () => {
  let layout: MockedLayout;
  beforeEach(() => {
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('lists the steps in place of the canvas: groups indented, gates as lines, cleanup as its own section', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    // No canvas, so no sideways flow and no scroll box to trap the swipe.
    expect(screen.queryByTestId('workflow-flow-canvas')).toBeNull();
    expect(screen.queryByTestId('workflow-flow-viewport')).toBeNull();
    const list = within(screen.getByTestId('workflow-step-list'));
    expect(list.getByText(/Tap a step to see its details\.$/)).toBeVisible();

    const steps = list.getByRole('list', {
      name: "The workflow's 3 steps, in order",
    });
    const first = within(steps).getByRole('button', {
      name: /^Step 1: Read the current pods, kubernetes · get_pods/,
    });
    expect(first).toHaveAttribute('aria-expanded', 'false');
    // The title is written out, never cut.
    expect(first).toHaveTextContent('Read the current pods');

    // The condition is a line on the step it may skip, not a fork.
    const gated = within(steps).getByRole('button', {
      name: /^Step 2: Apply the manifests/,
    });
    expect(gated).toHaveTextContent('Only if step 1 (fetch) succeeded');
    expect(list.queryByText(/^(yes|no)$/i)).toBeNull();

    // The loop is a card with its steps indented under it.
    const loop = within(steps).getByRole('button', {
      name: /^Step 3: Check every cluster/,
    });
    expect(loop).toHaveTextContent('For each cluster in the input “clusters”');
    const body = list.getByRole('list', { name: 'Steps of step 3' });
    expect(loop.closest('li')).toContainElement(body);
    expect(
      within(body).getByRole('button', { name: /^Step 3\.1: Probe it/ }),
    ).toBeInTheDocument();

    // Cleanup is its own section, after the steps.
    const cleanup = within(
      screen.getByRole('region', { name: 'If a step fails' }),
    );
    expect(
      cleanup.getByText('Cleanup muster runs when a step fails.'),
    ).toBeInTheDocument();
    expect(
      cleanup.getByRole('button', { name: /^Cleanup step: Roll back/ }),
    ).toBeInTheDocument();
    // Plain level: the exact tool name appears nowhere until asked for.
    expect(screen.queryByText('x_kubernetes_get_pods')).toBeNull();
  });

  it('opens a step’s details in place under it, several at once, and Close folds them back onto the step', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const gated = screen.getByRole('button', {
      name: /^Step 2: Apply the manifests/,
    });

    await userEvent.click(gated);
    expect(gated).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', {
      name: 'Details of Step 2 · Apply the manifests',
    });
    // In the step's own list item, right under it, and named as its control.
    expect(gated.closest('li')).toContainElement(panel);
    expect(gated).toHaveAttribute('aria-controls', panel.id);
    expect(
      within(panel).getByText(
        'Only if step 1 (fetch) succeeded — otherwise this step is skipped.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(panel).getByRole('button', {
        name: 'Show technical information',
      }),
    );
    expect(within(panel).getByText('x_kubernetes_apply')).toBeInTheDocument();

    // Opening another step leaves this one open: nothing jumps.
    await userEvent.click(
      screen.getByRole('button', { name: /^Step 1: Read the current pods/ }),
    );
    expect(screen.getAllByTestId('workflow-step-details')).toHaveLength(2);

    await userEvent.click(within(panel).getByRole('button', { name: 'Close' }));
    expect(gated).toHaveAttribute('aria-expanded', 'false');
    expect(gated).toHaveFocus();
    expect(screen.getAllByTestId('workflow-step-details')).toHaveLength(1);

    // A press on the card folds it too.
    const first = screen.getByRole('button', {
      name: /^Step 1: Read the current pods/,
    });
    await userEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('workflow-step-details')).toBeNull();
  });

  it('marks each card with the latest run and what its tool does', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const list = screen.getByTestId('workflow-step-list');
    const card = (key: string) =>
      list.querySelector(`[data-step-key="${key}"]`) as HTMLElement;

    await waitFor(() =>
      expect(card('s0')).toHaveAttribute('data-run-status', 'completed'),
    );
    expect(card('s0')).toHaveTextContent('✓ 1.2s');
    expect(card('s1')).toHaveTextContent('Skipped');
    expect(card('s2.0')).toHaveTextContent('✓ ×2');
    expect(card('f0')).toHaveAttribute('data-run-status', 'notRun');
    await waitFor(() => expect(card('s0')).toHaveTextContent('Reads'));
    expect(card('s1')).toHaveTextContent('Changes things');
    expect(
      screen.getByRole('button', {
        name: /^Step 2: .*skipped in the last run/,
      }),
    ).toBe(card('s1'));
  });

  it('shows a long workflow a page of steps at a time, a parallel group as its own indented list', async () => {
    mockWorkflows = [longWorkflow(300)];
    await renderAt(`${BASE}/long?installation=gazelle`);

    const steps = screen.getByRole('list', {
      name: "The workflow's 300 steps, in order",
    });
    // 20 top-level cards, the parallel group's two siblings under step 2.
    expect(
      within(steps).getAllByRole('button', { name: /^Step [\d.]+: / }),
    ).toHaveLength(22);
    const group = screen.getByRole('button', {
      name: /^Step 2: Check both regions, These run at the same time/,
    });
    const siblings = screen.getByRole('list', { name: 'Steps of step 2' });
    expect(group.closest('li')).toContainElement(siblings);
    expect(within(siblings).getAllByRole('button')).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Show 20 more steps' }),
    ).toBeInTheDocument();
  });

  it('wraps a long default instead of cutting it', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const pill = screen.getByTestId('arg-default');

    expect(getComputedStyle(pill).whiteSpace).not.toBe('nowrap');
    expect(getComputedStyle(pill.firstElementChild!).whiteSpace).toBe('normal');
    expect(pill).toHaveTextContent('default: false');
  });

  it('says when the last run started to the minute, as text — a phone shows no hover title', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(await screen.findByTestId('workflow-last-run')).toHaveTextContent(
      'started 9 Oct 2026, 08:00 UTC',
    );
  });
});

describe('WorkflowPage on a desktop', () => {
  let layout: MockedLayout;
  beforeEach(() => {
    layout = mockDesktopLayout();
  });
  afterEach(() => layout.restore());

  it('never cuts a step title: wraps it in a taller box, and tooltips only a title that may not show whole', async () => {
    const long =
      'Read the health of the control plane and of every node it reports';
    const huge =
      'CPU saturation across all nodes, averaged over fifteen minutes, compared with the requests the release asks for, per namespace and per node pool';
    mockWorkflows = [
      new MusterWorkflow(
        {
          apiVersion: 'muster.giantswarm.io/v1alpha1',
          kind: 'Workflow',
          metadata: { name: 'titles', namespace: 'muster' },
          spec: {
            steps: [
              { id: 'a', tool: 'core_service_list', description: 'Short' },
              { id: 'b', tool: 'core_service_list', description: long },
              { id: 'c', tool: 'core_service_list', description: huge },
            ],
          },
          status: { valid: true },
        } as never,
        'gazelle',
      ),
    ];
    await renderAt(`${BASE}/titles?installation=gazelle`);
    const figure = screen.getByTestId('workflow-flow-canvas');
    const node = (key: string) =>
      figure.querySelector(`[data-step-key="${key}"]`) as HTMLElement;
    const title = (key: string) =>
      within(node(key)).getByText(/./, {
        selector: '[class*="title"]',
      });

    // Every title is written out in full; the box decides how it shows.
    expect(node('s0')).toHaveAttribute('data-title-fit', 'oneLine');
    expect(title('s0')).toHaveTextContent('Short');
    expect(title('s0')).not.toHaveAttribute('title');
    expect(node('s1')).toHaveAttribute('data-title-fit', 'twoLines');
    expect(title('s1')).toHaveTextContent(long);
    expect(title('s1')).toHaveAttribute('title', long);
    expect(node('s2')).toHaveAttribute('data-title-fit', 'clamped');
    expect(title('s2')).toHaveTextContent(huge);
    expect(title('s2')).toHaveAttribute('title', huge);
    // A wrapped title gets the taller box, and the boxes share one width.
    expect(parseFloat(node('s1').style.height)).toBeGreaterThan(
      parseFloat(node('s0').style.height),
    );
    expect(node('s0').style.width).toBe(node('s2').style.width);
    // Two lines, then the clamp — never a one-line ellipsis.
    const style = getComputedStyle(title('s1'));
    expect(style.whiteSpace).not.toBe('nowrap');
    expect(style.textOverflow).not.toBe('ellipsis');
  });

  it('keeps the capped canvas, with no step list', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(screen.getByTestId('workflow-flow-viewport')).toBeInTheDocument();
    expect(screen.queryByTestId('workflow-step-list')).toBeNull();
    expect(
      screen.getByText(/Select a step to see its details\.$/),
    ).toBeInTheDocument();
  });
});
