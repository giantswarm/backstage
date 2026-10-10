import { useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { Cell, CellText, ColumnConfig, Flex, Table } from '@backstage/ui';
import {
  type CatalogFacet,
  CatalogFilterBar,
  CatalogNoMatch,
  EmptyStateCard,
  INITIAL_ROWS,
  LoadingIndicator,
  ShowMore,
  useCatalogFilters,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import type {
  ToolSummary,
  WorkflowExecutionListResponse,
} from '../../apis/types';
import type { MusterWorkflow } from '../../lib/k8s';
import { isGitOpsManaged } from '../../lib/gitops';
import type { ToolEffect } from '../../lib/toolAnnotations';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { workflowEffect } from '../../lib/workflowDisplay';
import { workflowDetailRouteRef } from '../../routes';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import { SessionGate, useToolCatalogue } from '../shared';
import { WorkflowEffectBadge } from '../WorkflowPage/WorkflowEffectBadge';
import {
  LAST_RUN_LABELS,
  LAST_RUN_ORDER,
  LAST_RUNS_WINDOW,
  type LastRunState,
  lastRunStates,
} from './lastRuns';

export type CustomizeWorkflowsPanelProps = {
  search: string;
};

type Row = {
  id: string;
  name: string;
  description: string;
  category?: string;
  steps: string;
  /** Derived read-only hint of `workflow_<name>`; absent while unknown. */
  effect?: ToolEffect;
  runs?: string;
  source: string;
};

/** "12 runs · 2 days ago", "No runs yet". */
export function runsLabel(response: WorkflowExecutionListResponse): string {
  if (response.total === 0) {
    return 'No runs yet';
  }
  const latest = formatRelativeTime(response.executions?.[0]?.started_at);
  const runs = `${response.total} run${response.total === 1 ? '' : 's'}`;
  return latest ? `${runs} · ${latest}` : runs;
}

const SOURCE_LABELS = {
  gitops: 'GitOps',
  manual: 'Manually added',
} as const;

/**
 * One rendered page of the table. The run queries live here, not above the
 * ShowMore, so only the workflows on screen ask muster for their latest run:
 * 300 workflows used to mean 300 `listExecutions` requests on open and again
 * on every search keystroke. A page is 20 workflows, and react-query's cache
 * (keyed per workflow, 30 s fresh) means a keystroke that keeps a workflow on
 * the page does not ask again.
 */
function WorkflowRows({
  workflows,
  installation,
  hasSession,
  tools,
}: {
  workflows: MusterWorkflow[];
  installation: string;
  hasSession: boolean;
  tools: ToolSummary[] | undefined;
}) {
  const musterApi = useApi(musterApiRef);
  const detailRoute = useRouteRef(workflowDetailRouteRef);

  // muster lists executions newest first, so one per workflow gives the
  // latest run, and `total` counts them all.
  const runs = useQueries({
    queries: workflows.map(workflow => ({
      queryKey: [
        'muster',
        'workflow-runs',
        installation,
        workflow.getName(),
      ] as const,
      queryFn: () =>
        musterApi.listExecutions({
          workflowName: workflow.getName(),
          limit: 1,
          installation,
        }),
      enabled: hasSession,
      staleTime: 30_000,
    })),
  });

  const rows = workflows.map<Row>((workflow, index) => {
    const steps = workflow.getStepCount();
    const response = runs[index]?.data;
    const effect = workflowEffect(workflow.getName(), tools);
    const category = workflow.getCategory();
    return {
      id: workflow.getName(),
      name: workflow.getName(),
      description: workflow.getDescription() ?? '',
      ...(category ? { category } : {}),
      steps: `${steps} step${steps === 1 ? '' : 's'}`,
      ...(effect ? { effect } : {}),
      ...(response ? { runs: runsLabel(response) } : {}),
      source: SOURCE_LABELS[isGitOpsManaged(workflow) ? 'gitops' : 'manual'],
    };
  });

  const columns: ColumnConfig<Row>[] = [
    {
      id: 'name',
      label: 'Workflow',
      isRowHeader: true,
      defaultWidth: '3fr',
      cell: row => <CellText title={row.name} description={row.description} />,
    },
    {
      id: 'category',
      label: 'Category',
      defaultWidth: '1fr',
      cell: row => <CellText title={row.category ?? ''} />,
    },
    {
      id: 'steps',
      label: 'Steps',
      defaultWidth: '0.8fr',
      cell: row => <CellText title={row.steps} />,
    },
    {
      id: 'effect',
      label: 'Access',
      defaultWidth: '1.2fr',
      // Always the same outer element: react-aria's table collection caches
      // the rendered cells, and a cell whose element type changes when the
      // catalogue resolves suspends the whole update. A row without a known
      // hint stays empty, claiming nothing.
      cell: row => (
        <Cell>
          {row.effect ? <WorkflowEffectBadge effect={row.effect} /> : null}
        </Cell>
      ),
    },
    {
      id: 'runs',
      label: 'Runs',
      defaultWidth: '1.5fr',
      cell: row => <CellText title={row.runs ?? ''} />,
    },
    {
      id: 'source',
      label: 'Source',
      defaultWidth: '1.2fr',
      cell: row => <CellText title={row.source} />,
    },
  ];

  return (
    // The table keeps its column grid at phone width; the wrapper lets it
    // scroll sideways instead of breaking the page's 375px layout.
    <div style={{ overflowX: 'auto' }}>
      <Table<Row>
        columnConfig={columns}
        data={rows}
        // Never bui's page mode: it draws its pagination footer even at three
        // rows. ShowMore above windows the sorted list instead.
        pagination={{ type: 'none' }}
        rowConfig={{
          getHref: row =>
            detailRoute
              ? `${detailRoute({ name: row.name })}?installation=${encodeURIComponent(installation)}`
              : undefined,
        }}
      />
    </div>
  );
}

function WorkflowsTable({
  search,
  installation,
}: {
  search: string;
  installation: string;
}) {
  const { workflows, activeInstallationInfo } = useMusterInstance();
  const session = useMusterSession();
  const hasSession =
    session.authenticated || !(activeInstallationInfo?.requiresAuth ?? false);

  // The whole per-session tool catalogue, one call: it carries the derived
  // readOnlyHint of every `workflow_<name>` tool. The hint is per-session, so
  // it is read here rather than off the CRs.
  const catalogue = useToolCatalogue(installation, hasSession);

  // The Last run filter's one read (T49): the installation's newest runs,
  // one request however many workflows there are.
  const musterApi = useApi(musterApiRef);
  const lastRuns = useQuery({
    queryKey: ['muster', 'workflow-last-runs', installation] as const,
    queryFn: () =>
      musterApi.listExecutions({ installation, limit: LAST_RUNS_WINDOW }),
    enabled: hasSession,
    staleTime: 30_000,
  });
  const facets = useMemo<CatalogFacet<MusterWorkflow>[]>(() => {
    if (!lastRuns.data) {
      return [];
    }
    const stateOf = lastRunStates(lastRuns.data);
    return [
      {
        id: 'lastRun',
        label: 'Last run',
        value: workflow => stateOf(workflow.getName()),
        optionLabel: value => LAST_RUN_LABELS[value as LastRunState] ?? value,
        order: LAST_RUN_ORDER,
      },
    ];
  }, [lastRuns.data]);

  const needle = search.trim().toLowerCase();
  // Sorted before ShowMore slices it, so the first page is the first 20 by
  // name, not whichever 20 the CR list happened to return first.
  const sorted = useMemo(
    () => [...workflows].sort((a, b) => a.getName().localeCompare(b.getName())),
    [workflows],
  );
  const searched = useMemo(
    () =>
      needle
        ? sorted.filter(workflow =>
            [
              workflow.getName(),
              workflow.getDescription() ?? '',
              workflow.getCategory() ?? '',
            ].some(field => field.toLowerCase().includes(needle)),
          )
        : sorted,
    [sorted, needle],
  );
  const filters = useCatalogFilters({ items: sorted, searched, facets });
  const visible = filters.filtered;

  if (workflows.length === 0) {
    return (
      <EmptyStateCard
        title="No workflows yet"
        description="Workflows run a sequence of tool calls as one tool agents can use."
      />
    );
  }
  const list =
    visible.length === 0 ? (
      <CatalogNoMatch
        plural="workflows"
        search={search}
        isFiltered={filters.isFiltered}
        onClearFilters={filters.clear}
      />
    ) : (
      // Keyed on the search and filters, so a new query starts again from
      // its first page.
      <ShowMore
        key={`${needle}|${filters.key}`}
        items={visible}
        initial={INITIAL_ROWS}
        noun="workflow"
      >
        {page => (
          <WorkflowRows
            workflows={page}
            installation={installation}
            hasSession={hasSession}
            tools={catalogue.data?.tools ?? undefined}
          />
        )}
      </ShowMore>
    );
  return (
    <Flex direction="column" gap="4">
      <CatalogFilterBar
        dimensions={filters.dimensions}
        onSelect={filters.select}
      />
      {!hasSession && (
        <SessionGate
          session={session}
          installation={installation}
          context="Workflow runs and the read-only badge are read through your muster session."
        />
      )}
      {list}
    </Flex>
  );
}

function Panel({ search }: CustomizeWorkflowsPanelProps) {
  const { activeInstallation, isLoading } = useMusterInstance();

  let body;
  if (isLoading) {
    body = <LoadingIndicator label="Reading your workflows…" />;
  } else if (!activeInstallation) {
    body = (
      <EmptyStateCard
        title="No workflows here"
        description="None of your environments runs muster, which runs workflows."
      />
    );
  } else {
    body = <WorkflowsTable search={search} installation={activeInstallation} />;
  }
  return (
    <Flex direction="column" gap="2">
      <ActiveInstallationNote />
      {body}
    </Flex>
  );
}

/**
 * The Workflows tab of the shell's Customize screen — read-only (decision
 * D11): the active muster's workflows with their category, step count, honest
 * "Only reads / Can change things" badge (the readOnlyHint muster derives on
 * each `workflow_<name>` tool), run count with the latest run, and whether
 * GitOps or muster's own store holds the definition. Each row opens the
 * workflow's page. Filtered by how the last run went, once runs tell the
 * workflows apart (T49). Must be mounted inside a `CustomizeMusterProvider`.
 */
export function CustomizeWorkflowsPanel(props: CustomizeWorkflowsPanelProps) {
  return (
    <QueryClientProvider>
      <Panel {...props} />
    </QueryClientProvider>
  );
}
