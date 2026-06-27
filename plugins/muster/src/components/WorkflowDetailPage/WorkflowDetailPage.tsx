import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Content,
  ContentHeader,
  EmptyState,
  Header,
  InfoCard,
  Link,
  Page,
  Progress,
  ResponseErrorPanel,
  StatusError,
  StatusOK,
  Table,
  TableColumn,
} from '@backstage/core-components';
import {
  Box,
  Button,
  Chip,
  Grid,
  Tooltip,
  Typography,
  makeStyles,
  Theme,
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import { Alert } from '@material-ui/lab';
import {
  DateComponent,
  JsonHighlight,
} from '@giantswarm/backstage-plugin-ui-react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { WorkflowArgDefinition } from '../../lib/k8s';
import { findReferencedBy } from '../../lib/workflowReferences';
import {
  MusterInstanceProvider,
  useMusterInstance,
} from '../MusterInstanceProvider';
import { InstallationPicker } from '../InstallationPicker';
import { workflowDetailRouteRef, workflowsRouteRef } from '../../routes';
import { WorkflowStepCard } from './WorkflowStepCard';
import { WorkflowStatsPanel } from './WorkflowStatsPanel';
import { RunWorkflowDialog } from './RunWorkflowDialog';
import { ExecutionHistoryPanel } from './ExecutionHistoryPanel';
import { ExecutionDetailPanel } from './ExecutionDetailPanel';

const EXECUTION_POLL_INTERVAL_MS = 3000;
const EXECUTION_LIST_POLL_INTERVAL_MS = 5000;

const useStyles = makeStyles((theme: Theme) => ({
  defGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(120px, max-content) 1fr',
    columnGap: theme.spacing(2),
    rowGap: theme.spacing(0.5),
    alignItems: 'baseline',
  },
  key: {
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
  historyContainer: {
    height: 'calc(100vh - 360px)',
    minHeight: 360,
  },
  refList: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
  },
}));

interface ArgRow {
  name: string;
  type: string;
  required: string;
  default: string;
  description: string;
}

function argRows(args: Record<string, WorkflowArgDefinition>): ArgRow[] {
  return Object.entries(args).map(([name, def]) => ({
    name,
    type: def.type ?? '-',
    required: def.required ? 'yes' : 'no',
    default: def.default !== undefined ? JSON.stringify(def.default) : '-',
    description: def.description ?? '',
  }));
}

function DefRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const classes = useStyles();
  return (
    <>
      <span className={classes.key}>{label}</span>
      <span>{children}</span>
    </>
  );
}

function WorkflowDetailContent() {
  const classes = useStyles();
  const { name = '' } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();
  const installationParam = searchParams.get('installation') ?? undefined;

  const musterApi = useApi(musterApiRef);
  const workflowsLink = useRouteRef(workflowsRouteRef);
  const workflowDetailLink = useRouteRef(workflowDetailRouteRef);
  const { workflows, isLoading, activeInstallation } = useMusterInstance();

  const [runOpen, setRunOpen] = useState(false);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>();

  const workflow = useMemo(() => {
    const byNameAndInstallation = workflows.find(
      w =>
        w.getName() === name &&
        (!installationParam || w.cluster === installationParam),
    );
    return byNameAndInstallation ?? workflows.find(w => w.getName() === name);
  }, [workflows, name, installationParam]);

  const installation = workflow?.cluster ?? installationParam;

  // Whether the resolved installation permits mutations (gates the Run action).
  const installationsQuery = useQuery({
    queryKey: ['muster', 'installations'],
    queryFn: () => musterApi.listInstallations(),
  });
  const allowMutations = installationsQuery.data?.installations.find(
    i => i.name === installation,
  )?.allowMutations;

  const executionsQuery = useQuery({
    queryKey: ['muster', 'executions', installation, name],
    queryFn: () =>
      musterApi.listExecutions({ workflowName: name, limit: 50, installation }),
    enabled: name !== '',
    refetchInterval: query =>
      query.state.data?.executions?.some(e => e.status === 'inprogress')
        ? EXECUTION_LIST_POLL_INTERVAL_MS
        : false,
  });

  const executionQuery = useQuery({
    queryKey: ['muster', 'execution', installation, selectedExecutionId],
    queryFn: () => musterApi.getExecution(selectedExecutionId!, installation),
    enabled: Boolean(selectedExecutionId),
    refetchInterval: query =>
      query.state.data?.status === 'inprogress'
        ? EXECUTION_POLL_INTERVAL_MS
        : false,
  });

  if (isLoading) {
    return (
      <Content>
        <Progress />
      </Content>
    );
  }

  if (!workflow) {
    return (
      <Content>
        <InstallationPicker />
        <EmptyState
          missing="data"
          title={`Workflow "${name}" not found`}
          description={
            !activeInstallation
              ? 'Select the installation that hosts this workflow above.'
              : 'No Workflow CR with this name in the selected installation. Try switching to the installation it belongs to.'
          }
        />
      </Content>
    );
  }

  const args = workflow.getArgs();
  const steps = workflow.getSteps();
  const referencedBy = findReferencedBy(name, workflows);
  const validationErrors = workflow.getValidationErrors();

  const argColumns: TableColumn<ArgRow>[] = [
    { title: 'Name', field: 'name', highlight: true },
    { title: 'Type', field: 'type', width: '120px' },
    { title: 'Required', field: 'required', width: '100px' },
    { title: 'Default', field: 'default', width: '140px' },
    { title: 'Description', field: 'description' },
  ];

  const runButton = (
    <Button
      color="primary"
      variant="contained"
      startIcon={<PlayArrowIcon />}
      disabled={!allowMutations}
      onClick={() => setRunOpen(true)}
    >
      Run
    </Button>
  );

  return (
    <Content>
      <InstallationPicker />
      <ContentHeader title={name} description={workflow.getDescription()}>
        <Link to={workflowsLink?.() ?? '#'} style={{ marginRight: 16 }}>
          ← All workflows
        </Link>
        {allowMutations ? (
          runButton
        ) : (
          <Tooltip title="Running a workflow mutates state. This installation is read-only (GitOps-managed); enable mutations in the muster proxy config to permit runs.">
            <span>{runButton}</span>
          </Tooltip>
        )}
      </ContentHeader>

      {!workflow.isValid() && (
        <Alert severity="warning" style={{ marginBottom: 16 }}>
          This workflow is marked invalid by muster.
          {validationErrors.length > 0 && (
            <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
              {validationErrors.map(err => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <InfoCard title="Overview">
            <Box className={classes.defGrid}>
              <DefRow label="Status">
                {workflow.isValid() ? (
                  <StatusOK>Valid</StatusOK>
                ) : (
                  <StatusError>Invalid</StatusError>
                )}
              </DefRow>
              <DefRow label="Installation">{workflow.cluster}</DefRow>
              <DefRow label="Steps">{workflow.getStepCount()}</DefRow>
              <DefRow label="Arguments">{Object.keys(args).length}</DefRow>
              <DefRow label="Category">
                {workflow.getCategory() ? (
                  <Chip size="small" label={workflow.getCategory()} />
                ) : (
                  '-'
                )}
              </DefRow>
              <DefRow label="Created">
                {workflow.getCreatedTimestamp() ? (
                  <DateComponent
                    value={workflow.getCreatedTimestamp()!}
                    relative
                    tooltip
                  />
                ) : (
                  '-'
                )}
              </DefRow>
            </Box>
          </InfoCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <WorkflowStatsPanel name={name} installation={installation} />
        </Grid>

        <Grid item xs={12}>
          <InfoCard title="Arguments" noPadding>
            {Object.keys(args).length === 0 ? (
              <Typography
                variant="body2"
                color="textSecondary"
                style={{ padding: 16 }}
              >
                This workflow takes no arguments.
              </Typography>
            ) : (
              <Table<ArgRow>
                columns={argColumns}
                data={argRows(args)}
                options={{
                  paging: false,
                  search: false,
                  toolbar: false,
                  padding: 'dense',
                }}
              />
            )}
          </InfoCard>
        </Grid>

        <Grid item xs={12}>
          <InfoCard title={`Steps (${steps.length})`}>
            {steps.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                This workflow defines no steps.
              </Typography>
            ) : (
              steps.map((step, index) => (
                <WorkflowStepCard
                  key={step.id}
                  step={step}
                  index={index}
                  installation={installation}
                />
              ))
            )}
          </InfoCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <InfoCard title={`Referenced by (${referencedBy.length})`}>
            {referencedBy.length === 0 ? (
              <Typography variant="body2" color="textSecondary">
                No other workflow calls this one.
              </Typography>
            ) : (
              <Box className={classes.refList}>
                {referencedBy.map(ref => {
                  const base =
                    workflowDetailLink?.({ name: ref.getName() }) ?? '#';
                  const href = `${base}?installation=${encodeURIComponent(
                    ref.cluster,
                  )}`;
                  return (
                    <Link key={`${ref.cluster}/${ref.getName()}`} to={href}>
                      {ref.getName()}
                    </Link>
                  );
                })}
              </Box>
            )}
          </InfoCard>
        </Grid>

        <Grid item xs={12} md={6}>
          <InfoCard title="Definition (raw)">
            <JsonHighlight customStyle={{ margin: 0, fontSize: '0.75rem' }}>
              {JSON.stringify(workflow.jsonData, null, 2)}
            </JsonHighlight>
          </InfoCard>
        </Grid>

        <Grid item xs={12}>
          <InfoCard title="Executions" noPadding>
            <Grid container>
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
                    onSelect={setSelectedExecutionId}
                  />
                )}
              </Grid>
              <Grid item xs={12} md={8} className={classes.historyContainer}>
                <ExecutionDetailPanel
                  execution={
                    selectedExecutionId ? executionQuery.data : undefined
                  }
                  isLoading={
                    Boolean(selectedExecutionId) && executionQuery.isLoading
                  }
                  error={executionQuery.error}
                />
              </Grid>
            </Grid>
          </InfoCard>
        </Grid>
      </Grid>

      <RunWorkflowDialog
        open={runOpen}
        onClose={() => setRunOpen(false)}
        name={name}
        installation={installation}
        args={args}
        onRan={() => executionsQuery.refetch()}
      />
    </Content>
  );
}

/**
 * Standalone (tabless) workflow detail page. CRD-driven: the structure (args,
 * steps, validity, step count, category) comes from the Workflow CR loaded by
 * the MusterInstanceProvider, while statistics, execution history, and runs use the
 * muster MCP proxy.
 */
export function WorkflowDetailPage() {
  return (
    <Page themeId="tool">
      <Header title="Workflow" type="Muster" />
      <ErrorsProvider>
        <MusterInstanceProvider>
          <WorkflowDetailContent />
        </MusterInstanceProvider>
      </ErrorsProvider>
    </Page>
  );
}
