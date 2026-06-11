import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  Content,
  ContentHeader,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import { Grid, makeStyles } from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import { useQuery } from '@tanstack/react-query';
import { Node } from '@xyflow/react';
import { musterApiRef } from '../../apis';
import {
  workflowToGraph,
  WorkflowNodeData,
  StepNodeData,
} from '../../lib/workflowToGraph';
import { WorkflowCanvas } from '../flow';
import { ExecutionHistoryPanel } from './ExecutionHistoryPanel';
import { StepDetailDrawer } from './StepDetailDrawer';

const EXECUTION_POLL_INTERVAL_MS = 3000;
const EXECUTION_LIST_POLL_INTERVAL_MS = 5000;

const useStyles = makeStyles({
  canvasContainer: {
    height: 'calc(100vh - 320px)',
    minHeight: 480,
  },
  historyContainer: {
    height: 'calc(100vh - 320px)',
    minHeight: 480,
  },
});

export function WorkflowDetailPage() {
  const classes = useStyles();
  const { name = '' } = useParams<{ name: string }>();
  const musterApi = useApi(musterApiRef);

  const [selectedExecutionId, setSelectedExecutionId] = useState<string>();
  const [selectedStepId, setSelectedStepId] = useState<string>();

  const workflowQuery = useQuery({
    queryKey: ['muster', 'workflow', name],
    queryFn: () => musterApi.getWorkflow(name),
    enabled: name !== '',
  });

  const executionsQuery = useQuery({
    queryKey: ['muster', 'executions', name],
    queryFn: () => musterApi.listExecutions({ workflowName: name, limit: 50 }),
    enabled: name !== '',
    // Keep the history fresh while anything is running.
    refetchInterval: query =>
      query.state.data?.executions?.some(
        execution => execution.status === 'inprogress',
      )
        ? EXECUTION_LIST_POLL_INTERVAL_MS
        : false,
  });

  const executionQuery = useQuery({
    queryKey: ['muster', 'execution', selectedExecutionId],
    queryFn: () => musterApi.getExecution(selectedExecutionId!),
    enabled: Boolean(selectedExecutionId),
    // Live per-step status while the selected execution is running.
    refetchInterval: query =>
      query.state.data?.status === 'inprogress'
        ? EXECUTION_POLL_INTERVAL_MS
        : false,
  });

  const workflow = workflowQuery.data?.workflow;
  const execution = selectedExecutionId ? executionQuery.data : undefined;

  const { nodes, edges } = useMemo(() => {
    if (!workflow) {
      return { nodes: [], edges: [] };
    }
    return workflowToGraph(workflow, execution);
  }, [workflow, execution]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node<WorkflowNodeData>) => {
      if (node.data.kind === 'step') {
        setSelectedStepId(node.id);
      }
    },
    [],
  );

  const selectedStepNode = nodes.find(
    (node): node is Node<StepNodeData> =>
      node.data.kind === 'step' && node.id === selectedStepId,
  );

  if (workflowQuery.error) {
    return (
      <Content>
        <ResponseErrorPanel error={workflowQuery.error as Error} />
      </Content>
    );
  }

  if (workflowQuery.isLoading || !workflow) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }

  return (
    <Content>
      <ContentHeader title={workflow.name} description={workflow.description} />
      {executionQuery.error && (
        <Alert severity="error" style={{ marginBottom: 16 }}>
          Failed to load the selected execution:{' '}
          {(executionQuery.error as Error).message}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid item xs={12} md={8} className={classes.canvasContainer}>
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            showLegend={Boolean(execution)}
            onNodeClick={onNodeClick}
          />
        </Grid>
        <Grid item xs={12} md={4} className={classes.historyContainer}>
          {executionsQuery.error ? (
            <ResponseErrorPanel
              title="Failed to load executions"
              error={executionsQuery.error as Error}
            />
          ) : (
            <ExecutionHistoryPanel
              executions={executionsQuery.data?.executions ?? []}
              selectedExecutionId={selectedExecutionId}
              onSelect={executionId => {
                setSelectedExecutionId(executionId);
                setSelectedStepId(undefined);
              }}
            />
          )}
        </Grid>
      </Grid>
      <StepDetailDrawer
        step={selectedStepNode?.data.step}
        executionStep={selectedStepNode?.data.executionStep}
        status={selectedStepNode?.data.status}
        onClose={() => setSelectedStepId(undefined)}
      />
    </Content>
  );
}
