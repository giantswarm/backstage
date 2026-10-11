import type { ReactNode } from 'react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import {
  type MockedLayout,
  mockDesktopLayout,
  mockPhoneLayout,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import { workflowsRouteRef } from '../../routes';
import { MusterWorkflow, WORKFLOW_CATEGORY_LABEL } from '../../lib/k8s';
import { CustomizeWorkflowsPanel, runsLabel } from './CustomizeWorkflowsPanel';

jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));

let mockWorkflows: MusterWorkflow[] = [];
let mockAuthenticated = true;
jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    scope: 'gazelle',
    homeInstallation: 'gazelle',
    isSingleInstallation: true,
    activeInstallationInfo: { name: 'gazelle', requiresAuth: true },
    mcpServers: [],
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

function makeWorkflow(
  name: string,
  steps: number,
  options: {
    description?: string;
    category?: string;
    gitops?: boolean;
  } = {},
) {
  return new MusterWorkflow(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        name,
        labels: {
          ...(options.category
            ? { [WORKFLOW_CATEGORY_LABEL]: options.category }
            : {}),
          ...(options.gitops ? { 'app.kubernetes.io/managed-by': 'Helm' } : {}),
        },
      },
      spec: {
        description: options.description,
        steps: Array.from({ length: steps }, (_, i) => ({
          id: `s${i}`,
          tool: 't',
        })),
      },
    } as never,
    'gazelle',
  );
}

const yesterday = new Date(Date.now() - 26 * 3600 * 1000).toISOString();

type Summary = {
  execution_id: string;
  workflow_name: string;
  status: 'completed' | 'failed' | 'inprogress';
  started_at: string;
  duration_ms: number;
  step_count: number;
};

const run = (
  workflow: string,
  status: Summary['status'],
  index = 0,
): Summary => ({
  execution_id: `${workflow}-${index}`,
  workflow_name: workflow,
  status,
  started_at: yesterday,
  duration_ms: 10,
  step_count: 1,
});

/** The installation's newest runs: what the Last run filter reads. */
let mockLastRuns: { executions: Summary[]; has_more: boolean } = {
  executions: [],
  has_more: false,
};

/** One workflow's latest run, as the table's per-row read gets it. */
function latestRunOf(workflowName: string) {
  if (workflowName !== 'ticket-report') {
    return { executions: [], total: 0, limit: 1, offset: 0, has_more: false };
  }
  return {
    executions: [
      {
        execution_id: 'e1',
        workflow_name: workflowName,
        status: 'completed' as const,
        started_at: yesterday,
        duration_ms: 10,
        step_count: 4,
      },
    ],
    total: 12,
    limit: 1,
    offset: 0,
    has_more: true,
  };
}

const api = {
  listExecutions: jest.fn(
    async ({ workflowName }: { workflowName?: string }) =>
      workflowName === undefined
        ? {
            executions: mockLastRuns.executions,
            total: mockLastRuns.executions.length,
            limit: 500,
            offset: 0,
            has_more: mockLastRuns.has_more,
          }
        : latestRunOf(workflowName),
  ),
  // The honest badge comes from the catalogue's `workflow_<name>` tools: the
  // aggregator derives readOnlyHint only when every reachable tool reads.
  filterTools: jest.fn(async () => ({
    total: 2,
    filtered_count: 2,
    truncated: false,
    tools: [
      {
        name: 'workflow_ticket-report',
        annotations: { readOnlyHint: true },
      },
      { name: 'workflow_upgrade-check' },
    ],
  })),
};

/** The per-row reads of one workflow's latest run, without the bulk read. */
const perWorkflowReads = () =>
  api.listExecutions.mock.calls.filter(([options]) => options.workflowName)
    .length;

function renderPanel(
  search = '',
  createAssist?: (installation: string) => ReactNode,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <QueryClientProvider client={client}>
      <CustomizeWorkflowsPanel search={search} createAssist={createAssist} />
    </QueryClientProvider>,
    {
      apis: [[musterApiRef, api]],
      mountedRoutes: { '/agent-platform/workflows': workflowsRouteRef },
    },
  );
}

describe('CustomizeWorkflowsPanel', () => {
  beforeEach(() => {
    mockAuthenticated = true;
    mockWorkflows = [
      makeWorkflow('ticket-report', 4, {
        description: 'Summarises the week’s tickets',
        category: 'support',
        gitops: true,
      }),
      makeWorkflow('upgrade-check', 1),
    ];
    mockLastRuns = { executions: [], has_more: false };
    api.listExecutions.mockClear();
    api.filterTools.mockClear();
  });

  it('lists the workflows with their steps and runs, opening each', async () => {
    await renderPanel();

    const report = screen.getByRole('row', { name: /ticket-report/ });
    expect(
      within(report).getByText('Summarises the week’s tickets'),
    ).toBeInTheDocument();
    expect(within(report).getByText('4 steps')).toBeInTheDocument();
    expect(
      await within(report).findByText('12 runs · 1 day ago'),
    ).toBeInTheDocument();
    expect(report).toHaveAttribute(
      'data-href',
      '/agent-platform/workflows/ticket-report?installation=gazelle',
    );

    const check = screen.getByRole('row', { name: /upgrade-check/ });
    expect(within(check).getByText('1 step')).toBeInTheDocument();
    expect(await within(check).findByText('No runs yet')).toBeInTheDocument();
    expect(api.listExecutions).toHaveBeenCalledWith({
      workflowName: 'upgrade-check',
      limit: 1,
      installation: 'gazelle',
    });
  });

  it('shows category, the honest read-only badge and the source', async () => {
    await renderPanel();

    const report = screen.getByRole('row', { name: /ticket-report/ });
    expect(within(report).getByText('support')).toBeInTheDocument();
    expect(await within(report).findByText('Only reads')).toBeInTheDocument();
    expect(within(report).getByText('GitOps')).toBeInTheDocument();

    // Without a derived readOnlyHint the workflow can change things — the
    // honest MCP default, never presented as harmless.
    const check = screen.getByRole('row', { name: /upgrade-check/ });
    expect(
      await within(check).findByText('Can change things'),
    ).toBeInTheDocument();
    expect(within(check).getByText('Manually added')).toBeInTheDocument();
  });

  it('offers no create, edit or delete affordances — workflows are read-only here', async () => {
    await renderPanel();

    expect(screen.queryByRole('button', { name: /create/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull();
  });

  it('shows the app’s way to create a workflow under the filters, for the installation shown', async () => {
    const createAssist = jest.fn((installation: string) => (
      <p>{`Create on ${installation}`}</p>
    ));
    await renderPanel('', createAssist);

    const hint = screen.getByText('Create on gazelle');
    expect(createAssist).toHaveBeenCalledWith('gazelle');
    // Before the list.
    expect(
      // eslint-disable-next-line no-bitwise
      hint.compareDocumentPosition(
        screen.getByRole('row', { name: /ticket-report/ }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows the way to create a workflow on an empty list too', async () => {
    mockWorkflows = [];
    await renderPanel('', installation => <p>{`Create on ${installation}`}</p>);

    expect(screen.getByText('No workflows yet')).toBeInTheDocument();
    expect(screen.getByText('Create on gazelle')).toBeInTheDocument();
  });

  it('asks for a muster session before reading runs and badges', async () => {
    mockAuthenticated = false;
    await renderPanel();

    expect(screen.getByText('4 steps')).toBeInTheDocument();
    expect(
      screen.getByText(
        /Run counts and the read-only badge need a muster session/,
      ),
    ).toBeInTheDocument();
    expect(api.listExecutions).not.toHaveBeenCalled();
    expect(api.filterTools).not.toHaveBeenCalled();
    // No badge is claimed while the hint cannot be read.
    expect(screen.queryByText('Only reads')).toBeNull();
    expect(screen.queryByText('Can change things')).toBeNull();
  });

  it('asks for no session while one is connected', async () => {
    await renderPanel();

    expect(
      screen.queryByText(/read through your muster session/),
    ).not.toBeInTheDocument();
  });

  it('searches names, descriptions and categories', async () => {
    await renderPanel('tickets');

    expect(screen.getByText('ticket-report')).toBeInTheDocument();
    expect(screen.queryByText('upgrade-check')).not.toBeInTheDocument();
  });

  it('finds workflows by category', async () => {
    await renderPanel('support');

    expect(screen.getByText('ticket-report')).toBeInTheDocument();
    expect(screen.queryByText('upgrade-check')).not.toBeInTheDocument();
  });

  it('shows three workflows plainly: no reveal control, no pagination footer', async () => {
    mockWorkflows = ['alpha', 'bravo', 'charlie'].map(name =>
      makeWorkflow(name, 2),
    );
    await renderPanel();

    // A header row plus the three workflows.
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /more|fewer/i })).toBeNull();
    expect(screen.queryByText(/shown/)).toBeNull();
    // bui's page mode draws "Next"/"Previous" and a page-size select.
    expect(screen.queryByRole('button', { name: /next|previous/i })).toBeNull();
    await waitFor(() => expect(perWorkflowReads()).toBe(3));
  });

  it('windows 300 workflows by name and reads runs only for the rows shown', async () => {
    const names = Array.from(
      { length: 300 },
      (_, i) => `wf-${String(i).padStart(3, '0')}`,
    );
    // Out of order, so the first page has to come from a sort.
    mockWorkflows = [...names].reverse().map(name => makeWorkflow(name, 1));
    await renderPanel();

    expect(screen.getAllByRole('row')).toHaveLength(21);
    expect(screen.getByRole('row', { name: /wf-000/ })).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /wf-019/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /wf-020/ })).toBeNull();
    expect(
      screen.getByText('20 workflows shown, 280 more'),
    ).toBeInTheDocument();
    await waitFor(() => expect(perWorkflowReads()).toBe(20));

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more workflows' }),
    );
    expect(screen.getAllByRole('row')).toHaveLength(41);
    // The next page asks for its own 20 runs, and nothing beyond it.
    await waitFor(() => expect(perWorkflowReads()).toBe(40));
    expect(api.listExecutions).not.toHaveBeenCalledWith(
      expect.objectContaining({ workflowName: 'wf-040' }),
    );
  });

  it('says when there are no workflows', async () => {
    mockWorkflows = [];
    await renderPanel();

    expect(screen.getByText('No workflows yet')).toBeInTheDocument();
  });
});

describe('CustomizeWorkflowsPanel at phone width (T22 B9)', () => {
  let layout: MockedLayout;
  const list = () => screen.getByRole('list', { name: 'Workflows' });
  const items = () => within(list()).getAllByRole('listitem');
  const itemOf = (name: string) =>
    within(list()).getByRole('link', { name }).closest('li') as HTMLElement;

  beforeEach(() => {
    mockAuthenticated = true;
    mockWorkflows = [
      makeWorkflow('ticket-report', 4, {
        description: 'Summarises the week’s tickets',
        category: 'support',
        gitops: true,
      }),
      makeWorkflow('upgrade-check', 1),
    ];
    mockLastRuns = { executions: [], has_more: false };
    api.listExecutions.mockClear();
    api.filterTools.mockClear();
    layout = mockPhoneLayout();
  });
  afterEach(() => layout.restore());

  it('stacks a row per workflow: name and access, then category · steps · runs · source', async () => {
    await renderPanel();

    // No six-column table squeezing the name to ~51px.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(items()).toHaveLength(2);

    const report = itemOf('ticket-report');
    expect(
      within(report).getByRole('link', { name: 'ticket-report' }),
    ).toHaveAttribute(
      'href',
      '/agent-platform/workflows/ticket-report?installation=gazelle',
    );
    expect(await within(report).findByText('Only reads')).toBeInTheDocument();
    expect(within(report).getByText('support')).toBeInTheDocument();
    expect(within(report).getByText('4 steps')).toBeInTheDocument();
    expect(
      await within(report).findByText('12 runs · 1 day ago'),
    ).toBeInTheDocument();
    expect(within(report).getByText('GitOps')).toBeInTheDocument();
    expect(
      within(report).getByText('Summarises the week’s tickets'),
    ).toBeInTheDocument();

    const check = itemOf('upgrade-check');
    expect(
      await within(check).findByText('Can change things'),
    ).toBeInTheDocument();
    expect(await within(check).findByText('No runs yet')).toBeInTheDocument();
    expect(within(check).getByText('Manually added')).toBeInTheDocument();
  });

  it('keeps the table on a wide viewport', async () => {
    layout.restore();
    layout = mockDesktopLayout();
    await renderPanel();

    expect(
      screen.queryByRole('list', { name: 'Workflows' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /ticket-report/ }),
    ).toBeInTheDocument();
  });

  it('shows three workflows plainly: no reveal control', async () => {
    mockWorkflows = ['alpha', 'bravo', 'charlie'].map(name =>
      makeWorkflow(name, 2),
    );
    await renderPanel();

    expect(items()).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /more|fewer/i })).toBeNull();
    expect(screen.queryByText(/shown/)).toBeNull();
    await waitFor(() => expect(perWorkflowReads()).toBe(3));
  });

  it('windows 300 workflows and reads runs only for the rows shown', async () => {
    mockWorkflows = Array.from({ length: 300 }, (_, i) =>
      makeWorkflow(`wf-${String(i).padStart(3, '0')}`, 1),
    ).reverse();
    await renderPanel();

    expect(items()).toHaveLength(20);
    expect(within(items()[0]).getByText('wf-000')).toBeInTheDocument();
    expect(
      screen.getByText('20 workflows shown, 280 more'),
    ).toBeInTheDocument();
    await waitFor(() => expect(perWorkflowReads()).toBe(20));

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more workflows' }),
    );
    expect(items()).toHaveLength(40);
    await waitFor(() => expect(perWorkflowReads()).toBe(40));
  });

  it('narrows the stacked rows with the last-run filter', async () => {
    mockLastRuns = {
      executions: [run('ticket-report', 'failed')],
      has_more: false,
    };
    await renderPanel();

    await userEvent.click(
      await screen.findByRole('button', {
        name: /Filter by last run/,
        hidden: true,
      }),
    );
    await userEvent.click(
      await screen.findByRole('option', { name: /^Failed/ }),
    );
    await userEvent.keyboard('{Escape}');

    expect(items()).toHaveLength(1);
    expect(itemOf('ticket-report')).toBeInTheDocument();
  });
});

describe('CustomizeWorkflowsPanel last-run filter (T49, T64)', () => {
  const rows = () => screen.getAllByRole('row').slice(1);
  /** The last-run dropdown, once the runs are read; readable while open. */
  const lastRunDropdown = () =>
    screen.findByRole('button', { name: /Filter by last run/, hidden: true });
  /** The last-run dropdown's options, as "label count", read and closed. */
  const lastRunOptions = async () => {
    await userEvent.click(await lastRunDropdown());
    const options = within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .map(option => option.textContent);
    await userEvent.keyboard('{Escape}');
    return options;
  };
  /** Toggles one last-run state. */
  const pickLastRun = async (option: string) => {
    await userEvent.click(await lastRunDropdown());
    await userEvent.click(await screen.findByRole('option', { name: option }));
    await userEvent.keyboard('{Escape}');
  };

  beforeEach(() => {
    mockAuthenticated = true;
    api.listExecutions.mockClear();
    api.filterTools.mockClear();
  });

  it('offers a one-option dropdown over three workflows whose last runs all went the same way', async () => {
    mockWorkflows = ['alpha', 'bravo', 'charlie'].map(name =>
      makeWorkflow(name, 2),
    );
    mockLastRuns = {
      executions: ['alpha', 'bravo', 'charlie'].map(name =>
        run(name, 'completed'),
      ),
      has_more: false,
    };
    await renderPanel();

    await waitFor(() =>
      expect(api.listExecutions).toHaveBeenCalledWith({
        installation: 'gazelle',
        limit: 500,
      }),
    );
    expect(rows()).toHaveLength(3);
    expect(await lastRunOptions()).toEqual(['Succeeded 3']);
  });

  it('filters three workflows by their last run, the newest run deciding', async () => {
    mockWorkflows = ['alpha', 'bravo', 'charlie'].map(name =>
      makeWorkflow(name, 2),
    );
    mockLastRuns = {
      // Newest first: alpha failed last, after an older success.
      executions: [
        run('alpha', 'failed', 2),
        run('bravo', 'inprogress', 1),
        run('alpha', 'completed', 0),
      ],
      has_more: false,
    };
    await renderPanel();

    expect(await lastRunOptions()).toEqual([
      'Failed 1',
      'Running 1',
      'Not run yet 1',
    ]);

    await pickLastRun('Failed 1');
    expect(rows()).toHaveLength(1);
    expect(screen.getByRole('row', { name: /alpha/ })).toBeInTheDocument();
    await pickLastRun('Running 1');
    expect(rows()).toHaveLength(2);
    expect(await lastRunDropdown()).toHaveTextContent(
      'Last run 2Failed and Running',
    );
  });

  it('says "No recent run", not "Not run yet", when the window does not hold every run', async () => {
    mockWorkflows = ['alpha', 'bravo'].map(name => makeWorkflow(name, 2));
    mockLastRuns = { executions: [run('alpha', 'completed')], has_more: true };
    await renderPanel();

    expect(await lastRunOptions()).toEqual(['Succeeded 1', 'No recent run 1']);
  });

  it('offers no last-run filter without a muster session', async () => {
    mockAuthenticated = false;
    mockWorkflows = ['alpha', 'bravo'].map(name => makeWorkflow(name, 2));
    mockLastRuns = { executions: [run('alpha', 'failed')], has_more: false };
    await renderPanel();

    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(api.listExecutions).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('group', { name: 'Filters' }),
    ).not.toBeInTheDocument();
  });

  it('filters 300 workflows with one bulk read, paging the result from its first page', async () => {
    const names = Array.from(
      { length: 300 },
      (_, i) => `wf-${String(i).padStart(3, '0')}`,
    );
    mockWorkflows = names.map(name => makeWorkflow(name, 1));
    mockLastRuns = {
      // Every third workflow failed last; the others succeeded.
      executions: names.map((name, i) =>
        run(name, i % 3 === 0 ? 'failed' : 'completed'),
      ),
      has_more: false,
    };
    await renderPanel();

    expect(await lastRunOptions()).toEqual(['Failed 100', 'Succeeded 200']);
    await userEvent.click(
      screen.getByRole('button', { name: 'Show 20 more workflows' }),
    );
    expect(rows()).toHaveLength(40);

    await pickLastRun('Failed 100');

    expect(rows()).toHaveLength(20);
    expect(screen.getByRole('row', { name: /wf-000/ })).toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /wf-001/ })).toBeNull();
    expect(screen.getByText('20 workflows shown, 80 more')).toBeInTheDocument();

    await pickLastRun('Succeeded 200');
    expect(
      screen.getByText('20 workflows shown, 280 more'),
    ).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('group', { name: 'Filters' })).getByRole(
        'button',
        { name: 'Clear filters' },
      ),
    );
    expect(await lastRunDropdown()).toHaveTextContent('Last runAll');
    // One bulk read for the filter, whatever the count.
    expect(
      api.listExecutions.mock.calls.filter(
        ([options]) => options.workflowName === undefined,
      ),
    ).toHaveLength(1);
  });

  it('says when the filter leaves nothing of a search, and clears it', async () => {
    mockWorkflows = ['alpha', 'bravo'].map(name => makeWorkflow(name, 2));
    mockLastRuns = { executions: [run('alpha', 'failed')], has_more: false };
    await renderPanel('bravo');

    await pickLastRun('Failed 0');
    expect(
      screen.getByText('No workflows match “bravo” with these filters.'),
    ).toBeInTheDocument();
    // The empty state's way back (the bar offers the same).
    const [, emptyStateClear] = screen.getAllByRole('button', {
      name: 'Clear filters',
    });
    await userEvent.click(emptyStateClear);
    expect(screen.getByRole('row', { name: /bravo/ })).toBeInTheDocument();
  });
});

describe('runsLabel', () => {
  it('counts the runs and says when the last one started', () => {
    expect(
      runsLabel({
        executions: [],
        total: 0,
        limit: 1,
        offset: 0,
        has_more: false,
      }),
    ).toBe('No runs yet');
    expect(
      runsLabel({
        executions: null,
        total: 1,
        limit: 1,
        offset: 0,
        has_more: false,
      }),
    ).toBe('1 run');
  });
});
