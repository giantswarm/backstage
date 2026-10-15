import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  PageHeaderActionsProvider,
  ShellScopeProvider,
} from '@giantswarm/backstage-plugin-ui-react';
import {
  mockDesktopLayout,
  mockPhoneLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';
import { musterApiRef } from '../../apis';
import { customizeExternalRouteRef, workflowsRouteRef } from '../../routes';
import { MCPServer, MusterWorkflow } from '../../lib/k8s';
import { DEFAULT_DETAILS_HEIGHT } from './WorkflowFlowCanvas';
import { WorkflowPage } from './WorkflowPage';
import { useWorkflowPageTarget } from './workflowPageTarget';

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

// "Edit in Git…" looks the workflow's GitOps source up through flux-react.
const mockUseGitOpsSource = jest.fn();
jest.mock('@giantswarm/backstage-plugin-flux-react', () => ({
  useGitOpsSource: (...args: unknown[]) => mockUseGitOpsSource(...args),
}));

// Watched, not replaced: the manifest is serialized only once it is opened.
const mockToKubectlYaml = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => {
  const actual = jest.requireActual(
    '@giantswarm/backstage-plugin-kubernetes-react',
  );
  return {
    ...actual,
    toKubectlYaml: (object: never) => {
      mockToKubectlYaml(object);
      return actual.toKubectlYaml(object);
    },
  };
});

let mockWorkflows: MusterWorkflow[] = [];
let mockAuthenticated = true;
let mockRequiresAuth = true;
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    activeInstallationInfo: { name: 'gazelle', requiresAuth: mockRequiresAuth },
    installationInfos: [{ name: 'gazelle', requiresAuth: mockRequiresAuth }],
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
      inputSchema: {
        type: 'object',
        properties: { app: { type: 'string', description: 'The app name' } },
        required: ['app'],
      },
    })),
    callTool: jest.fn(async () => ({ deployed: 'shop' })),
    getAuthStatus: jest.fn(async () => ({ servers: [] })),
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
    // The installation's tool catalogue: the steps' tools and the
    // workflow's own, with muster's derived read-only hint.
    filterTools: jest.fn(async () => ({
      total: 3,
      filtered_count: 3,
      truncated: false,
      tools: [
        {
          name: 'x_kubernetes_get_pods',
          annotations: { readOnlyHint: true },
        },
        { name: 'x_kubernetes_apply', annotations: { readOnlyHint: false } },
        {
          name: 'workflow_deploy',
          kind: 'workflow',
          annotations: { readOnlyHint: true },
        },
      ] as Array<Record<string, unknown>>,
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
  };
}

async function renderAt(
  path: string,
  api = makeApi(),
  editAction?: ReactElement,
  /** Inside the agent shell's frame: the nav rail beside `#content`. */
  inShell = false,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const page = (
    <Routes>
      <Route
        path="/agent-platform/workflows/:name/*"
        element={<WorkflowPage editAction={editAction} />}
      />
    </Routes>
  );
  await renderInTestApp(
    // The shell mounts the scope around its pages, as the app does.
    <ShellScopeProvider>
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          {inShell ? (
            <>
              <nav aria-label="Main">
                <a href="/agent-platform/sessions">Sessions</a>
              </nav>
              <div id="content">{page}</div>
            </>
          ) : (
            page
          )}
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </ShellScopeProvider>,
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

// The formatters read the reader's locale; the assertions below are English,
// so the default locale is pinned rather than left to the machine's LANG.
const pinnedLocale = 'en-US';
let localeSpies: jest.SpyInstance[] = [];

beforeAll(() => {
  const pin = (proto: any, method: string) => {
    const original = proto[method];
    localeSpies.push(
      jest.spyOn(proto, method).mockImplementation(function pinned(
        this: unknown,
        locale?: any,
        ...rest: any[]
      ) {
        return original.call(this, locale ?? pinnedLocale, ...rest);
      }),
    );
  };
  pin(Date.prototype, 'toLocaleDateString');
  pin(Date.prototype, 'toLocaleString');
  pin(Number.prototype, 'toLocaleString');
});

afterAll(() => {
  localeSpies.forEach(spy => spy.mockRestore());
  localeSpies = [];
});

beforeEach(() => {
  mockWorkflows = [DEPLOY];
  mockAuthenticated = true;
  mockRequiresAuth = true;
  // Run it remembers a run's inputs per installation and tool.
  window.localStorage.clear();
  mockUseGitOpsSource.mockReset();
  mockUseGitOpsSource.mockReturnValue({
    inGit: false,
    isLoading: false,
    errors: [],
  });
});

/** DEPLOY with the given provenance labels and annotations. */
function deployWith(
  labels: Record<string, string>,
  annotations?: Record<string, string>,
): MusterWorkflow {
  const json = DEPLOY.jsonData as unknown as {
    metadata: Record<string, unknown>;
  };
  return new MusterWorkflow(
    {
      ...DEPLOY.jsonData,
      metadata: { ...json.metadata, labels, annotations },
    } as never,
    'gazelle',
  );
}

/** DEPLOY as rendered by the agent-platform chart's HelmRelease. */
function gitOpsDeploy(): MusterWorkflow {
  return deployWith({
    'helm.toolkit.fluxcd.io/name': 'agent-platform-workflows',
    'helm.toolkit.fluxcd.io/namespace': 'agent-platform',
  });
}

describe('WorkflowPage', () => {
  it('heads the page with its place under Customize and the honest badge', async () => {
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

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
    // The derived hint comes off the tools endpoint, never the CR.
    // Off the catalogue the flow canvas reads too: no request of its own.
    expect(api.filterTools).toHaveBeenCalledTimes(1);
    expect(api.filterTools).toHaveBeenCalledWith(
      expect.objectContaining({ installation: 'gazelle' }),
    );
    expect(api.describeTool).not.toHaveBeenCalled();
    // One column: no facts beside the content, everything in the tabs.
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('opens on Overview: what it is for under its heading, when it was created', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    const section = screen.getByRole('region', { name: 'What it’s for' });
    expect(
      within(section).getByRole('heading', { level: 2, name: 'What it’s for' }),
    ).toBeInTheDocument();
    expect(section).toHaveTextContent('Deploys an app and tells the team.');
    expect(within(section).getByText(/^Created/)).toBeInTheDocument();
  });

  it('says so where the definition gives no description', async () => {
    mockWorkflows = [
      new MusterWorkflow(
        {
          ...DEPLOY.jsonData,
          spec: { ...DEPLOY.jsonData.spec, description: undefined },
        } as never,
        'gazelle',
      ),
    ];
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    expect(
      within(screen.getByRole('region', { name: 'What it’s for' })).getByText(
        'Its definition gives no description.',
      ),
    ).toBeInTheDocument();
  });

  it('links its tabs under the workflow’s address, keeping the installation', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    for (const [name, path] of [
      ['Overview', ''],
      ['Run it', '/run'],
      ['Usage', '/usage'],
      ['Details', '/details'],
    ]) {
      expect(
        screen.getByRole('tab', { name }).closest('a') ??
          screen.getByRole('tab', { name }),
      ).toHaveAttribute('href', `${BASE}/deploy${path}?installation=gazelle`);
    }
  });

  it('links its tabs with the address’s own query, adding none it lacks', async () => {
    await renderAt(`${BASE}/deploy`);

    expect(screen.getByRole('tab', { name: 'Usage' })).toHaveAttribute(
      'href',
      `${BASE}/deploy/usage`,
    );
  });

  it('lands an address it no longer has on Overview, keeping its query', async () => {
    await renderAt(`${BASE}/deploy/runs?installation=gazelle&foo=b`);

    expect(
      await screen.findByRole('region', { name: 'What it’s for' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'aria-selected',
        'true',
      ),
    );
    expect(screen.getByRole('tab', { name: 'Usage' })).toHaveAttribute(
      'href',
      `${BASE}/deploy/usage?installation=gazelle&foo=b`,
    );
  });

  it('names the workflow in the document title', async () => {
    // Live round 2 (R5): the page set none, so a client-side visit kept the
    // previous page's title.
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    await waitFor(() => expect(document.title).toBe('deploy · Workflows'));
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

  it('expands a step in place to its plain details, with its own technical fold-out', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const figure = within(screen.getByTestId('workflow-flow-canvas'));
    const step = screen.getByRole('button', {
      name: /^Step 2: Apply the manifests/,
    });
    expect(step).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(step);
    expect(step).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', {
      name: 'Details of Step 2 · Apply the manifests',
    });
    // Inside the step's own box in the diagram — no area under the canvas —
    // and named as the step's control.
    expect(step.closest('[data-node]')).toContainElement(panel);
    expect(screen.getByTestId('workflow-flow-viewport')).toContainElement(
      panel,
    );
    expect(step).toHaveAttribute('aria-controls', panel.id);
    // The box is the frame and the step folds it: no heading or Close.
    const details = within(panel);
    expect(
      details.queryByRole('heading', { name: /Apply the manifests/ }),
    ).toBeNull();
    expect(details.queryByRole('button', { name: 'Close' })).toBeNull();
    // Announced.
    expect(figure.getByRole('status')).toHaveTextContent(
      'Step 2 · Apply the manifests: details shown.',
    );
    expect(
      details.getByText(/on the kubernetes connector/),
    ).toBeInTheDocument();
    expect(
      details.getByText(
        'Only if step 1 (fetch) succeeded — otherwise this step is skipped.',
      ),
    ).toBeInTheDocument();
    // Technical fields stay folded until this step's fold-out opens — and
    // opening it keeps the step open.
    expect(details.queryByText('x_kubernetes_apply')).toBeNull();
    await userEvent.click(
      details.getByRole('button', { name: 'Show technical information' }),
    );
    expect(step).toHaveAttribute('aria-expanded', 'true');
    expect(details.getByText('x_kubernetes_apply')).toBeInTheDocument();
    expect(details.getByText('fromStep: fetch')).toBeInTheDocument();
    expect(details.getByText('expect: success=true')).toBeInTheDocument();

    // One step at a time: another one folds this one, its own folded again.
    const first = screen.getByRole('button', {
      name: /^Step 1: Read the current pods/,
    });
    await userEvent.click(first);
    expect(step).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByTestId('workflow-step-details')).toHaveLength(1);
    const firstPanel = within(
      screen.getByRole('region', {
        name: 'Details of Step 1 · Read the current pods',
      }),
    );
    expect(firstPanel.queryByText('{{ .input.app }}')).toBeNull();
    await userEvent.click(
      firstPanel.getByRole('button', { name: 'Show technical information' }),
    );
    expect(firstPanel.getByText('{{ .input.app }}')).toBeInTheDocument();
    expect(
      firstPanel.getByText('stores its result for later steps'),
    ).toBeInTheDocument();
    // Pressing it again folds it.
    await userEvent.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('workflow-step-details')).toBeNull();
    expect(figure.getByRole('status')).toHaveTextContent('');
  });

  it('gives the expanded step room: its box grows and the steps after it move down', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const box = (key: string) =>
      screen
        .getByTestId('workflow-flow-canvas')
        .querySelector(`[data-node="${key}"]`) as HTMLElement;
    const loop = () =>
      screen
        .getByTestId('workflow-flow-canvas')
        .querySelector('[data-group="forEach"]') as HTMLElement;
    const px = (value: string) => parseFloat(value);
    const before = {
      height: px(box('s0').style.height),
      next: px(box('s1').style.top),
      loop: px(loop().style.top),
    };

    await userEvent.click(
      screen.getByRole('button', { name: /^Step 1: Read the current pods/ }),
    );
    // jsdom lays nothing out, so the details keep their default room.
    expect(px(box('s0').style.height)).toBe(
      before.height + DEFAULT_DETAILS_HEIGHT,
    );
    expect(px(box('s1').style.top)).toBe(before.next + DEFAULT_DETAILS_HEIGHT);
    expect(px(loop().style.top)).toBe(before.loop + DEFAULT_DETAILS_HEIGHT);
    // The step's own lines keep their height above the details.
    const head = within(box('s0')).getByRole('button', {
      name: /^Step 1: Read the current pods/,
    });
    expect(px(head.style.height)).toBe(before.height - 2);
  });

  it('folds the open step by keyboard, by pressing it again and by a click beside the steps', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    const step = screen.getByRole('button', {
      name: /^Step 2: Apply the manifests/,
    });

    // The step is a focusable button: Enter expands it, Escape folds it and
    // leaves the focus on it.
    step.focus();
    await userEvent.keyboard('{Enter}');
    expect(step).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(step).toHaveAttribute('aria-expanded', 'false');
    expect(step).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(step).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard(' ');
    expect(step).toHaveAttribute('aria-expanded', 'false');

    // A click on the canvas beside the steps folds it.
    await userEvent.click(step);
    await userEvent.click(screen.getByTestId('workflow-flow-viewport'));
    expect(step).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('workflow-step-details')).toBeNull();
  });

  it('takes the flow full screen over the content area, beside the rail, and back by its button or Escape', async () => {
    await renderAt(
      `${BASE}/deploy?installation=gazelle`,
      makeApi(),
      undefined,
      true,
    );
    const content = document.getElementById('content')!;
    const rail = screen.getByRole('navigation', { name: 'Main' });
    // The content area starts where the rail ends (the layout pads it).
    let railWidth = 240;
    jest
      .spyOn(content, 'getBoundingClientRect')
      .mockImplementation(() => ({ left: railWidth }) as DOMRect);

    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    const layer = screen.getByRole('dialog', {
      name: 'deploy: flow, full screen',
    });
    // A layer of its own, over the content area only: from the content
    // area's left edge to the window's right, the full viewport height.
    expect(layer.parentElement).toBe(document.body);
    expect(layer.style.left).toBe('240px');
    const geometry = getComputedStyle(layer);
    expect(geometry.position).toBe('fixed');
    expect(geometry.top).toBe('0px');
    expect(geometry.bottom).toBe('0px');
    expect(geometry.right).toBe('0px');
    // The page behind it goes inert; the rail beside it stays in use, so
    // the layer is no modal.
    expect(content).toHaveAttribute('inert');
    expect(rail).not.toHaveAttribute('inert');
    expect(rail.closest('[inert]')).toBeNull();
    expect(layer.closest('[inert]')).toBeNull();
    expect(layer).not.toHaveAttribute('aria-modal');
    expect(layer).toHaveFocus();
    expect(
      within(layer).getByRole('heading', { name: 'deploy' }),
    ).toBeInTheDocument();
    const viewport = within(layer).getByTestId('workflow-flow-viewport');
    expect(viewport.className).toMatch(/scrollerFull/);
    // The flow takes the layer's whole height: no inline cap (min(560px,
    // 70vh)) left on its box, and the figure stretches down the layer.
    expect(getComputedStyle(viewport).maxHeight).toBe('none');
    expect(getComputedStyle(viewport).flexGrow).toBe('1');
    const fullFigure = within(layer).getByTestId('workflow-flow-canvas');
    expect(getComputedStyle(fullFigure).flexGrow).toBe('1');
    expect(getComputedStyle(fullFigure).minHeight).toBe('0px');
    // No second canvas left on the page.
    expect(screen.getAllByTestId('workflow-flow-canvas')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();

    // The rail collapsing narrows it: the layer follows the content area.
    railWidth = 72;
    fireEvent(window, new Event('resize'));
    expect(layer.style.left).toBe('72px');

    // Steps expand in place there too; Escape folds the step first…
    const step = within(layer).getByRole('button', {
      name: /^Step 2: Apply the manifests/,
    });
    await userEvent.click(step);
    expect(
      within(layer).getByRole('region', {
        name: 'Details of Step 2 · Apply the manifests',
      }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(step).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // …then leaves full screen, focus back on the control that opened it.
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(content).not.toHaveAttribute('inert');
    const toggle = screen.getByRole('button', { name: 'Full screen' });
    expect(toggle).toHaveFocus();
    expect(screen.getByTestId('workflow-flow-viewport').className).not.toMatch(
      /scrollerFull/,
    );

    // Escape on the rail is the rail's: full screen stays.
    await userEvent.click(toggle);
    screen.getByRole('link', { name: 'Sessions' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // The explicit control leaves it too.
    await userEvent.click(
      screen.getByRole('button', { name: 'Exit full screen' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(content).not.toHaveAttribute('inert');
  });

  it('covers the whole window outside the shell frame, everything else inert', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    await userEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    const layer = screen.getByRole('dialog', {
      name: 'deploy: flow, full screen',
    });
    expect(layer.style.left).toBe('0px');
    expect(document.querySelectorAll('body > [inert]').length).toBeGreaterThan(
      0,
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Exit full screen' }),
    );
    expect(document.querySelectorAll('body > [inert]')).toHaveLength(0);
  });

  it('expands a group head’s details in place: what the loop runs over', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    const head = screen.getByRole('button', {
      name: /^Step 3: Check every cluster/,
    });
    await userEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    const panel = screen.getByRole('region', {
      name: 'Details of Step 3 · Check every cluster',
    });
    expect(head.closest('[data-group="forEach"]')).toContainElement(panel);
    const details = within(panel);
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
    // The step's box: its button and the markers riding its top edge.
    const box = (key: string) =>
      figure.querySelector(`[data-node="${key}"]`) as HTMLElement;
    await waitFor(() =>
      expect(node('s0')).toHaveAttribute('data-run-status', 'completed'),
    );
    expect(node('s0')).toHaveTextContent('✓ 1.2 s');
    expect(node('s1')).toHaveAttribute('data-run-status', 'skipped');
    expect(node('s1')).toHaveTextContent('Skipped');
    // Two loop iterations, no recorded duration: a count, no made-up time.
    expect(node('s2.0')).toHaveTextContent('✓ ×2');
    expect(node('s2.0')).not.toHaveTextContent(/\d+ms|\d+\.\ds/);
    // The cleanup lane did not run.
    expect(node('f0')).toHaveAttribute('data-run-status', 'notRun');

    // Read/write accents from the tool catalogue's annotations.
    await waitFor(() => expect(box('s0')).toHaveTextContent('Reads'));
    expect(box('s1')).toHaveTextContent('Changes things');
    expect(box('f0')).not.toHaveTextContent(/Reads|Changes things/);

    // The step's details say how its last run went.
    await userEvent.click(node('s1'));
    expect(
      within(screen.getByTestId('workflow-step-details')).getByText(
        'Last run: skipped — its condition did not hold.',
      ),
    ).toBeInTheDocument();
  });

  it('orders Overview: what it is for, what it needs, how it runs — no statistics or technical details', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    const titles = ['What it’s for', 'What it needs', 'How it runs'].map(name =>
      screen.getByRole('heading', { level: 2, name }),
    );
    for (let i = 1; i < titles.length; i++) {
      expect(
        // eslint-disable-next-line no-bitwise
        titles[i - 1].compareDocumentPosition(titles[i]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // Statistics live on Usage, the facts and technical details on Details,
    // the manifest in the menu.
    expect(screen.queryByTestId('workflow-last-run')).toBeNull();
    expect(screen.queryByText(/about three weeks/)).toBeNull();
    expect(screen.queryByText('Technical details')).toBeNull();
    expect(screen.queryByText('workflow_deploy')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Advanced/ })).toBeNull();
    expect(screen.queryByRole('textbox', { name: /YAML|Manifest/ })).toBeNull();
  });

  it('puts the last run and muster’s run totals on Usage', async () => {
    const api = await renderAt(`${BASE}/deploy/usage?installation=gazelle`);

    expect(
      screen.getByText(
        'Every run counts, whether an agent, another workflow or a person started it.',
      ),
    ).toBeInTheDocument();

    const lastRun = await screen.findByTestId('workflow-last-run');
    expect(lastRun).toHaveTextContent('Last run');
    expect(lastRun).toHaveTextContent('Succeeded');
    expect(lastRun).toHaveTextContent('started 9 Oct 2026, 08:00 UTC');
    expect(lastRun).toHaveTextContent('took 18 s');
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

  it('names a failed last run’s error on Usage', async () => {
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
    await renderAt(`${BASE}/deploy/usage?installation=gazelle`, api);

    const lastRun = await screen.findByTestId('workflow-last-run');
    expect(lastRun).toHaveTextContent('Failed');
    expect(lastRun).toHaveTextContent('apply refused');
    expect(lastRun).toHaveTextContent('took 2.0 s');
  });

  it('lists the plain facts on Details, then the CR’s bookkeeping in a Technical details fold-out', async () => {
    await renderAt(`${BASE}/deploy/details?installation=gazelle`);

    const facts = screen.getByRole('region', { name: 'Workflow details' });
    expect(facts).toHaveTextContent(
      'Manually added — changed by agents through muster, not here',
    );
    expect(within(facts).getByText('Tool name')).toBeInTheDocument();
    expect(within(facts).getByText('workflow_deploy')).toBeInTheDocument();
    expect(within(facts).getByText('Called as a step by')).toBeInTheDocument();
    expect(within(facts).getByText('No other workflow')).toBeInTheDocument();
    // When it was created is on Overview only.
    expect(within(facts).queryByText('Created')).toBeNull();

    const trigger = screen.getByRole('button', { name: 'Technical details' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('x_kubernetes_get_pods')).toBeNull();
    await userEvent.click(trigger);
    // A fact per row, as the plain facts above.
    const [, technical] = screen
      .getAllByRole('definition')
      .map(value => value.closest('dl')!)
      .filter((list, index, lists) => lists.indexOf(list) === index);
    expect(
      within(technical)
        .getAllByRole('term')
        .map(term => term.textContent),
    ).toEqual(['Namespace', 'Referenced tools']);
    expect(
      within(technical).getByText('x_kubernetes_get_pods'),
    ).toBeInTheDocument();
    // Facts read at the shell's body size.
    expect(within(facts).getByText('workflow_deploy')).toHaveAttribute(
      'data-variant',
      'body-medium',
    );
    expect(within(technical).getByText('muster')).toHaveAttribute(
      'data-variant',
      'body-medium',
    );
    // The raw YAML is the menu's manifest, not part of the page.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('gives the labels a row of their own in Technical details, one label per line', async () => {
    mockWorkflows = [gitOpsDeploy()];
    await renderAt(`${BASE}/deploy/details?installation=gazelle`);

    await userEvent.click(
      screen.getByRole('button', { name: 'Technical details' }),
    );
    const labels = screen.getByText('Labels').closest('dt')!
      .nextElementSibling as HTMLElement;
    expect(labels.tagName).toBe('DD');
    expect(
      within(labels).getByText(
        'helm.toolkit.fluxcd.io/name=agent-platform-workflows',
      ),
    ).toBeInTheDocument();
    expect(
      within(labels).getByText(
        'helm.toolkit.fluxcd.io/namespace=agent-platform',
      ),
    ).toBeInTheDocument();
    // Namespace is a row of its own, not run into the labels.
    expect(within(labels).queryByText('muster')).toBeNull();
  });

  it('links the workflows that call it as a step on Details', async () => {
    const caller = new MusterWorkflow(
      {
        apiVersion: 'muster.giantswarm.io/v1alpha1',
        kind: 'Workflow',
        metadata: { name: 'release', namespace: 'muster' },
        spec: { steps: [{ id: 'run', tool: 'workflow_deploy' }] },
      } as never,
      'gazelle',
    );
    mockWorkflows = [DEPLOY, caller];
    await renderAt(`${BASE}/deploy/details?installation=gazelle`);

    expect(
      within(
        screen.getByRole('region', { name: 'Workflow details' }),
      ).getByRole('link', { name: 'release' }),
    ).toHaveAttribute('href', `${BASE}/release?installation=gazelle`);
  });

  it('shows the CR’s manifest from "View manifest" in its menu, with a copy button', async () => {
    mockToKubectlYaml.mockClear();
    await renderAt(`${BASE}/deploy?installation=gazelle`);
    expect(mockToKubectlYaml).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      screen.queryByRole('menuitem', { name: 'Edit in Git…' }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Workflow manifest');
    expect(dialog).toHaveTextContent('As stored on cluster gazelle');
    const manifest = within(dialog).getByRole('textbox', { name: 'Manifest' });
    // ManifestDialog renders the real editor (the mock above replaces only
    // the barrel's export), so the YAML is read off the lines it draws.
    expect(manifest).toHaveTextContent('kind: Workflow');
    expect(manifest).toHaveTextContent('name: deploy');
    expect(manifest).toHaveTextContent('tool: x_kubernetes_get_pods');
    expect(
      within(dialog).getByRole('button', { name: 'Copy manifest' }),
    ).toBeInTheDocument();
  });

  it('offers no create, edit or delete affordances of its own, and runs only from Run it', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    // Anchored: step buttons may name a tool such as kubernetes · delete.
    expect(screen.queryByRole('button', { name: /^edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^delete/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^create/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^run/i })).toBeNull();
    // Overview → Run it → Usage → Details.
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Run it',
      'Usage',
      'Details',
    ]);
  });

  it('runs the workflow on Run it with the tool page’s form, and shows the result', async () => {
    const api = await renderAt(`${BASE}/deploy/run?installation=gazelle`);

    // The tool page's form, for the workflow's tool, without the description
    // Overview already gives.
    const inputs = await screen.findByRole('region', { name: 'Inputs' });
    expect(screen.queryByRole('region', { name: 'What it’s for' })).toBeNull();
    expect(api.describeTool).toHaveBeenCalledWith('workflow_deploy', 'gazelle');
    // A workflow on read-only tools changes nothing; its connector has its
    // own credentials, so the note does not claim it runs as the person.
    expect(within(inputs).getByText('Nothing is changed.')).toBeInTheDocument();
    expect(screen.getByText('Only reads')).toBeInTheDocument();

    await userEvent.type(
      within(inputs).getByRole('textbox', { name: /app/i }),
      'shop',
    );
    await userEvent.click(within(inputs).getByRole('button', { name: 'Run' }));

    await waitFor(() =>
      expect(api.callTool).toHaveBeenCalledWith(
        'workflow_deploy',
        expect.objectContaining({ app: 'shop' }),
        'gazelle',
      ),
    );
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Result' }),
    ).toBeInTheDocument();
  });

  it('reads the run records again after a run, so Usage counts it', async () => {
    const api = await renderAt(`${BASE}/deploy/usage?installation=gazelle`);
    await waitFor(() => expect(api.listExecutions).toHaveBeenCalled());
    const before = api.listExecutions.mock.calls.length;

    await userEvent.click(screen.getByRole('tab', { name: 'Run it' }));
    const inputs = await screen.findByRole('region', { name: 'Inputs' });
    await userEvent.type(
      within(inputs).getByRole('textbox', { name: /app/i }),
      'shop',
    );
    await userEvent.click(within(inputs).getByRole('button', { name: 'Run' }));
    await screen.findByRole('heading', { level: 2, name: 'Result' });

    await userEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    await waitFor(() =>
      expect(api.listExecutions.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('says on Run it that the run needs a sign-in to a connector its steps call', async () => {
    const api = makeApi();
    api.getAuthStatus.mockResolvedValue({
      servers: [{ name: 'kubernetes', status: 'auth_required' }],
    } as never);
    await renderAt(`${BASE}/deploy/run?installation=gazelle`, api);

    expect(
      await screen.findByText('Sign in to a connector first'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/muster refuses the run until you are/),
    ).toBeInTheDocument();
    // The form still shows: signing in makes the run possible.
    expect(
      await screen.findByRole('button', { name: 'Run' }),
    ).toBeInTheDocument();
  });

  it('explains on Run it, instead of a form, a workflow muster offers the person no tool for', async () => {
    const api = makeApi();
    api.filterTools.mockImplementation(async () => ({
      total: 1,
      filtered_count: 1,
      truncated: false,
      tools: [{ name: 'x_kubernetes_get_pods' }],
    }));
    await renderAt(`${BASE}/deploy/run?installation=gazelle`, api);

    expect(
      await screen.findByRole('heading', {
        name: 'No tool “workflow_deploy” for you on gazelle',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    // Not described: describing a tool muster lacks is an error, not an answer.
    expect(api.describeTool).not.toHaveBeenCalled();
    expect(screen.queryByText('Only reads')).toBeNull();
  });

  it('lets the form describe a workflow a truncated catalogue stops short of', async () => {
    const api = makeApi();
    api.filterTools.mockImplementation(async () => ({
      total: 3000,
      filtered_count: 1,
      truncated: true,
      tools: [{ name: 'x_kubernetes_get_pods' }],
    }));
    await renderAt(`${BASE}/deploy/run?installation=gazelle`, api);

    expect(
      await screen.findByRole('region', { name: 'Inputs' }),
    ).toBeInTheDocument();
    // Described, for the badge and the form alike.
    expect(api.describeTool).toHaveBeenCalledWith('workflow_deploy', 'gazelle');
    expect(screen.getByText('Only reads')).toBeInTheDocument();
  });

  it('says on Run it that no run is possible where muster has no per-user sessions', async () => {
    mockRequiresAuth = false;
    const api = await renderAt(`${BASE}/deploy/run?installation=gazelle`);

    expect(
      await screen.findByRole('heading', {
        name: 'This portal cannot run workflows on gazelle',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/configure an auth provider/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  describe('while a run is in flight', () => {
    /** Starts a run on Run it that does not return. */
    async function startRun() {
      const api = makeApi();
      api.callTool.mockImplementation(() => new Promise(() => {}));
      await renderAt(`${BASE}/deploy/run?installation=gazelle`, api);
      const inputs = await screen.findByRole('region', { name: 'Inputs' });
      await userEvent.type(
        within(inputs).getByRole('textbox', { name: /app/i }),
        'shop',
      );
      await userEvent.click(
        within(inputs).getByRole('button', { name: 'Run' }),
      );
      await within(inputs).findByRole('button', { name: /Running/ });
      return api;
    }

    it('asks before a tab switch, says the run goes on, and stays on Stay', async () => {
      await startRun();

      await userEvent.click(screen.getByRole('tab', { name: 'Usage' }));
      const dialog = await screen.findByRole('dialog');
      expect(
        within(dialog).getByText('Leave while the workflow runs?'),
      ).toBeInTheDocument();
      expect(dialog).toHaveTextContent(
        'muster keeps running it after you leave',
      );
      // Still here, behind the modal dialog.
      expect(
        screen.getByRole('region', { name: 'Inputs', hidden: true }),
      ).toBeInTheDocument();

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Stay' }),
      );
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(
        within(screen.getByRole('region', { name: 'Inputs' })).getByRole(
          'button',
          { name: /Running/ },
        ),
      ).toBeInTheDocument();
    });

    it('switches the tab on Leave', async () => {
      await startRun();

      await userEvent.click(screen.getByRole('tab', { name: 'Usage' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Leave' }),
      );
      expect(await screen.findByText(/^Every run counts/)).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Inputs' })).toBeNull();
    });

    it('asks before following a link out of the page', async () => {
      await startRun();

      await userEvent.click(screen.getByRole('link', { name: 'Workflows' }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      // Still here, behind the modal dialog.
      expect(
        screen.getByRole('region', { name: 'Inputs', hidden: true }),
      ).toBeInTheDocument();
    });

    it('has the browser ask before a reload or a closed tab', async () => {
      await startRun();

      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
    });
  });

  it('lets the page go without asking once no run is in flight', async () => {
    await renderAt(`${BASE}/deploy/run?installation=gazelle`);
    await screen.findByRole('region', { name: 'Inputs' });

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    await userEvent.click(screen.getByRole('tab', { name: 'Usage' }));
    expect(await screen.findByText(/^Every run counts/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks for a muster session on Run it in place of the form', async () => {
    mockAuthenticated = false;
    const api = await renderAt(`${BASE}/deploy/run?installation=gazelle`);

    expect(
      screen.getByText(/Running a workflow needs a muster session/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull();
    expect(api.filterTools).not.toHaveBeenCalled();
    expect(api.describeTool).not.toHaveBeenCalled();
  });

  it('offers no Edit in Git… for a workflow outside Git', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      screen.getByRole('menuitem', { name: 'View manifest' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'Edit in Git…' }),
    ).not.toBeInTheDocument();
    expect(mockUseGitOpsSource).not.toHaveBeenCalled();
  });

  it('offers no Edit in Git… for a workflow from a chart installed by hand, which Git does not hold', async () => {
    mockWorkflows = [
      deployWith(
        { 'app.kubernetes.io/managed-by': 'Helm' },
        {
          'meta.helm.sh/release-name': 'workflows',
          'meta.helm.sh/release-namespace': 'muster',
        },
      ),
    ];
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(
      screen.queryByRole('menuitem', { name: 'Edit in Git…' }),
    ).not.toBeInTheDocument();
    expect(mockUseGitOpsSource).not.toHaveBeenCalled();
  });

  it('says where in Git to change a GitOps-managed workflow, from "Edit in Git…" in its menu', async () => {
    mockWorkflows = [gitOpsDeploy()];
    mockUseGitOpsSource.mockReturnValue({
      inGit: true,
      isLoading: false,
      url: 'https://github.com/giantswarm/management-clusters/tree/abc123/management-clusters/gazelle',
      changeRequestTerm: 'pull request',
      errors: [],
      kustomization: {
        name: 'collection',
        namespace: 'flux-giantswarm',
        path: './management-clusters/gazelle',
      },
      helmRelease: {
        name: 'agent-platform-workflows',
        namespace: 'agent-platform',
      },
    });
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    await userEvent.click(
      screen.getByRole('menuitem', { name: 'Edit in Git…' }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Edit or remove deploy');
    expect(
      within(dialog).getByRole('link', {
        name: /management-clusters\/gazelle/,
      }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/management-clusters/tree/abc123/management-clusters/gazelle',
    );
    expect(dialog).toHaveTextContent(
      'Find where HelmRelease agent-platform/agent-platform-workflows and its values',
    );
    expect(dialog).toHaveTextContent(
      'Do not edit or add a kind: Workflow document: the chart would render the workflow again.',
    );
    expect(mockUseGitOpsSource).toHaveBeenCalledWith(
      expect.any(MusterWorkflow),
      'gazelle',
    );
  });

  it('shows an attached edit action beside the title, with the workflow to act on', async () => {
    // agent-platform's hand-off to the workflow agent attaches here; it reads
    // the workflow from the page, the way this probe does.
    function Probe() {
      const target = useWorkflowPageTarget();
      return (
        <button type="button" data-definition={target?.definitionYaml}>
          {`Edit ${target?.name} on ${target?.installation} via ${target?.toolName}${
            target?.gitOps ? ' (GitOps)' : ''
          }`}
        </button>
      );
    }
    await renderAt(`${BASE}/deploy?installation=gazelle`, makeApi(), <Probe />);

    const action = screen.getByRole('button', {
      name: 'Edit deploy on gazelle via workflow_deploy',
    });
    // The header-actions slot every shell detail page uses (ShellPage
    // `actions`): straight in the actions row, beside the title block — not
    // wrapped under it — and the header carries no description that would
    // push it there (as on the agent and skill pages).
    const title = screen.getByRole('heading', { level: 1, name: 'deploy' });
    const actionsRow = action.parentElement!;
    expect(actionsRow.className).toMatch(/actions/);
    const header = actionsRow.parentElement!;
    expect(header).toContainElement(title);
    expect(actionsRow).not.toContainElement(title);
    expect(header).not.toHaveTextContent('Deploys an app and tells the team.');
    expect(
      screen.getByText('Deploys an app and tells the team.'),
    ).toBeInTheDocument();
    // In the page's header, after the title.
    expect(
      // eslint-disable-next-line no-bitwise
      title.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      // eslint-disable-next-line no-bitwise
      action.compareDocumentPosition(screen.getByText('What it needs')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The definition in the shape muster's workflow tools take.
    const definition = action.getAttribute('data-definition') ?? '';
    expect(definition).toMatch(/^name: deploy$/m);
    expect(definition).toMatch(/^steps:$/m);
    expect(definition).toMatch(/tool: x_kubernetes_apply/);
    expect(definition).toMatch(/^onFailure:$/m);
    expect(definition).not.toMatch(/apiVersion|metadata/);
  });

  it('asks for a muster session instead of claiming runs or a badge, and still draws the definition', async () => {
    mockAuthenticated = false;
    const api = await renderAt(`${BASE}/deploy?installation=gazelle`);

    // Overview names what it needs the session for; statistics are on Usage.
    expect(
      screen.getByText(
        /The last run on the flow and the read-only badge need a muster session/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Statistics need/)).toBeNull();
    expect(screen.queryByText('Only reads')).toBeNull();
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

  it('asks for a muster session on Usage in place of statistics', async () => {
    mockAuthenticated = false;
    const api = await renderAt(`${BASE}/deploy/usage?installation=gazelle`);

    expect(
      screen.getByText(/Statistics need a muster session/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/The last run on the flow/)).toBeNull();
    expect(screen.queryByText(/Every run counts/)).toBeNull();
    expect(api.getWorkflowStats).not.toHaveBeenCalled();
  });

  it('says so, with a way back, for a workflow the installation lacks', async () => {
    await renderAt(`${BASE}/missing?installation=gazelle`);

    expect(
      screen.getByText('No workflow “missing” on gazelle'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Back to workflows' }),
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

  it('keeps the four tabs and the menu, with the facts on Details rather than folded above the content', async () => {
    await renderAt(`${BASE}/deploy/details?installation=gazelle`);

    for (const name of ['Overview', 'Run it', 'Usage', 'Details']) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: 'More actions' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(
      screen.getByRole('region', { name: 'Workflow details' }),
    ).toHaveTextContent('workflow_deploy');
  });

  it('runs the workflow from Run it at phone width with the same form', async () => {
    const api = await renderAt(`${BASE}/deploy/run?installation=gazelle`);

    const inputs = await screen.findByRole('region', { name: 'Inputs' });
    await userEvent.click(within(inputs).getByRole('button', { name: 'Run' }));
    // Required input left empty: the form says so on the field, not a call.
    expect(api.callTool).not.toHaveBeenCalled();
    await userEvent.type(
      within(inputs).getByRole('textbox', { name: /app/i }),
      'shop',
    );
    await userEvent.click(within(inputs).getByRole('button', { name: 'Run' }));
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Result' }),
    ).toBeInTheDocument();
  });

  it('lists the steps in place of the canvas: groups indented, gates as lines, cleanup as its own section', async () => {
    await renderAt(`${BASE}/deploy?installation=gazelle`);

    // No canvas, so no sideways flow and no scroll box to trap the swipe —
    // and nothing to take full screen.
    expect(screen.queryByTestId('workflow-flow-canvas')).toBeNull();
    expect(screen.queryByTestId('workflow-flow-viewport')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull();
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
    expect(card('s0')).toHaveTextContent('✓ 1.2 s');
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
    await renderAt(`${BASE}/deploy/usage?installation=gazelle`);

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
    const box = (key: string) =>
      figure.querySelector(`[data-node="${key}"]`) as HTMLElement;
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
    expect(parseFloat(box('s1').style.height)).toBeGreaterThan(
      parseFloat(box('s0').style.height),
    );
    expect(box('s0').style.width).not.toBe('');
    expect(box('s0').style.width).toBe(box('s2').style.width);
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
