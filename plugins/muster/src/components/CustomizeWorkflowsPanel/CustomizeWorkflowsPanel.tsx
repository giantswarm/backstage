import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import { CellText, ColumnConfig, Flex, Table, Text } from '@backstage/ui';
import {
  EmptyStateCard,
  LoadingIndicator,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import type { WorkflowExecutionListResponse } from '../../apis/types';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { workflowDetailRouteRef } from '../../routes';
import { ActiveInstallationNote } from '../ActiveInstallationNote';
import { useMusterInstance, useMusterSession } from '../MusterInstanceProvider';
import { QueryClientProvider } from '../QueryClientProvider';
import { SessionGate } from '../shared';

export type CustomizeWorkflowsPanelProps = {
  search: string;
};

type Row = {
  id: string;
  name: string;
  description: string;
  steps: string;
  runs?: string;
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

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      workflows
        .filter(
          workflow =>
            !needle ||
            [workflow.getName(), workflow.getDescription() ?? ''].some(field =>
              field.toLowerCase().includes(needle),
            ),
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
    return {
      id: workflow.getName(),
      name: workflow.getName(),
      description: workflow.getDescription() ?? '',
      steps: `${steps} step${steps === 1 ? '' : 's'}`,
      ...(response ? { runs: runsLabel(response) } : {}),
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
      id: 'steps',
      label: 'Steps',
      defaultWidth: '1fr',
      cell: row => <CellText title={row.steps} />,
    },
    {
      id: 'runs',
      label: 'Runs',
      defaultWidth: '1.5fr',
      cell: row => <CellText title={row.runs ?? ''} />,
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
    );
  return (
    <Flex direction="column" gap="4">
      {!hasSession && (
        <SessionGate
          session={session}
          installation={installation}
          context="Workflow runs are read through your muster session."
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
 * The Workflows tab of the shell's Customize screen: the active muster's
 * workflows with their step count and runs, each opening the workflow's page.
 * Must be mounted inside a `CustomizeMusterProvider`.
 */
export function CustomizeWorkflowsPanel(props: CustomizeWorkflowsPanelProps) {
  return (
    <QueryClientProvider>
      <Panel {...props} />
    </QueryClientProvider>
  );
}
