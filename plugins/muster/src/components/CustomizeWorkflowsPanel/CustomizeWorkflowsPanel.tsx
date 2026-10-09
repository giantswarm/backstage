import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { Cell, CellText, ColumnConfig, Flex, Table, Text } from '@backstage/ui';
import {
  EmptyStateCard,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import type { WorkflowExecutionListResponse } from '../../apis/types';
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
  const musterApi = useApi(musterApiRef);
  const detailRoute = useRouteRef(workflowDetailRouteRef);

  // The whole per-session tool catalogue, one call: it carries the derived
  // readOnlyHint of every `workflow_<name>` tool. The hint is per-session, so
  // it is read here rather than off the CRs.
  const catalogue = useToolCatalogue(installation, hasSession);

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      workflows
        .filter(
          workflow =>
            !needle ||
            [
              workflow.getName(),
              workflow.getDescription() ?? '',
              workflow.getCategory() ?? '',
            ].some(field => field.toLowerCase().includes(needle)),
        )
        .sort((a, b) => a.getName().localeCompare(b.getName())),
    [workflows, needle],
  );

  // muster lists executions newest first, so one per workflow gives the
  // latest run, and `total` counts them all.
  const runs = useQueries({
    queries: visible.map(workflow => ({
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

  const rows = visible.map<Row>((workflow, index) => {
    const steps = workflow.getStepCount();
    const response = runs[index]?.data;
    const effect = workflowEffect(
      workflow.getName(),
      catalogue.data?.tools ?? undefined,
    );
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

  if (workflows.length === 0) {
    return (
      <EmptyStateCard
        title="No workflows yet"
        description="Workflows run a sequence of tool calls as one tool agents can use."
      />
    );
  }
  const list =
    rows.length === 0 ? (
      <Text as="p" variant="body-medium" color="secondary">
        No workflows match “{search.trim()}”.
      </Text>
    ) : (
      // The table keeps its column grid at phone width; the wrapper lets it
      // scroll sideways instead of breaking the page's 375px layout.
      <div style={{ overflowX: 'auto' }}>
        <Table<Row>
          columnConfig={columns}
          data={rows}
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
  return (
    <Flex direction="column" gap="4">
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
 * workflow's page. Must be mounted inside a `CustomizeMusterProvider`.
 */
export function CustomizeWorkflowsPanel(props: CustomizeWorkflowsPanelProps) {
  return (
    <QueryClientProvider>
      <Panel {...props} />
    </QueryClientProvider>
  );
}
