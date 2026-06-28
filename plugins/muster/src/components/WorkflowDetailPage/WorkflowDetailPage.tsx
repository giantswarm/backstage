import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import yaml from 'js-yaml';
import { useApi, useRouteRef } from '@backstage/frontend-plugin-api';
import {
  Content,
  EmptyState,
  Header,
  Link,
  MarkdownContent,
  Page,
  Progress,
  ResponseErrorPanel,
} from '@backstage/core-components';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Grid,
  Tooltip,
  Typography,
  makeStyles,
  useTheme,
  Theme,
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import BarChart from '@material-ui/icons/BarChart';
import Tune from '@material-ui/icons/Tune';
import FormatListNumbered from '@material-ui/icons/FormatListNumbered';
import Share from '@material-ui/icons/Share';
import History from '@material-ui/icons/History';
import ChevronRight from '@material-ui/icons/ChevronRight';
import AccountTree from '@material-ui/icons/AccountTree';
import ExpandMore from '@material-ui/icons/ExpandMore';
import { Alert } from '@material-ui/lab';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';
import { ErrorsProvider } from '@giantswarm/backstage-plugin-kubernetes-react';
import { useQuery } from '@tanstack/react-query';
import { musterApiRef } from '../../apis';
import { findReferencedBy } from '../../lib/workflowReferences';
import {
  MusterInstanceProvider,
  useMusterInstance,
} from '../MusterInstanceProvider';
import { InstallationPicker } from '../InstallationPicker';
import { SectionHeader, AvailabilityBadge, VIOLET } from '../shared';
import {
  mcpServersRouteRef,
  workflowDetailRouteRef,
  workflowsRouteRef,
} from '../../routes';
import { WorkflowStepCard } from './WorkflowStepCard';
import { WorkflowStatsPanel } from './WorkflowStatsPanel';
import { RunWorkflowDialog } from './RunWorkflowDialog';
import { ExecutionHistoryPanel } from './ExecutionHistoryPanel';
import { ExecutionDetailPanel } from './ExecutionDetailPanel';

const EXECUTION_POLL_INTERVAL_MS = 3000;
const EXECUTION_LIST_POLL_INTERVAL_MS = 5000;

const useStyles = makeStyles((theme: Theme) => ({
  // Reading-capped column (mockup `max-w-5xl`).
  column: {
    maxWidth: 1024,
  },
  header: {
    paddingBottom: theme.spacing(3),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  breadcrumb: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    marginBottom: theme.spacing(1.5),
    color: theme.palette.text.secondary,
    fontSize: 14,
    '& svg': { fontSize: 14 },
  },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(1.5),
  },
  title: {
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
  runAction: {
    marginLeft: 'auto',
  },
  description: {
    marginTop: theme.spacing(1.5),
    maxWidth: '80ch',
    color: theme.palette.text.secondary,
    '& p': { margin: 0 },
  },
  metaRow: {
    marginTop: theme.spacing(2),
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.5, 3),
    color: theme.palette.text.secondary,
    fontSize: 12,
  },
  mono: {
    fontFamily: 'monospace',
    color: theme.palette.text.primary,
  },
  section: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
    borderBottom: `1px solid ${theme.palette.divider}`,
    '&:last-child': {
      borderBottom: 'none',
    },
  },
  // Arguments list (mockup `divide-y rounded-lg border`).
  argList: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  argRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(0.5),
    padding: theme.spacing(1.25, 1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    '&:first-child': { borderTop: 'none' },
    [theme.breakpoints.up('sm')]: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: theme.spacing(1.5),
    },
  },
  argHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  argName: {
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: 500,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    height: 20,
    paddingLeft: theme.spacing(0.75),
    paddingRight: theme.spacing(0.75),
    borderRadius: theme.shape.borderRadius,
    fontSize: 11,
    lineHeight: 1,
    whiteSpace: 'nowrap',
  },
  badgeType: {
    backgroundColor: theme.palette.action.selected,
    color: theme.palette.text.secondary,
  },
  badgeRequired: {
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.warning.dark,
  },
  argDescription: {
    color: theme.palette.text.secondary,
  },
  refList: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius * 2,
    overflow: 'hidden',
  },
  refRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    padding: theme.spacing(1.25, 1.5),
    borderTop: `1px solid ${theme.palette.divider}`,
    '&:first-child': { borderTop: 'none' },
    '& svg': { fontSize: 14, color: VIOLET, flexShrink: 0 },
  },
  refLink: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  yamlAccordion: {
    borderRadius: theme.shape.borderRadius * 2,
    '&:before': { display: 'none' },
  },
  yamlSummary: {
    fontWeight: 500,
  },
  yamlPre: {
    margin: 0,
    width: '100%',
    overflowX: 'auto',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 1.6,
    color: theme.palette.text.secondary,
  },
  historyContainer: {
    height: 'calc(100vh - 360px)',
    minHeight: 360,
  },
}));

/** Append `?installation=` to a route path so deep links keep the instance. */
function withInstallation(base: string, installation?: string): string {
  if (!installation) {
    return base;
  }
  return `${base}?installation=${encodeURIComponent(installation)}`;
}

function WorkflowDetailContent() {
  const classes = useStyles();
  const theme = useTheme();
  const { name = '' } = useParams<{ name: string }>();
  const [searchParams] = useSearchParams();
  const installationParam = searchParams.get('installation') ?? undefined;
  const runIntent = searchParams.get('run') === '1';

  const musterApi = useApi(musterApiRef);
  const workflowsLink = useRouteRef(workflowsRouteRef);
  const mcpServersLink = useRouteRef(mcpServersRouteRef);
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

  // Honour a `?run=1` deep link (the list's "Run workflow…" action) once the
  // workflow has loaded and the installation permits it.
  useEffect(() => {
    if (runIntent && workflow && allowMutations) {
      setRunOpen(true);
    }
  }, [runIntent, workflow, allowMutations]);

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
        <InstallationPicker />
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
  const argEntries = Object.entries(args);
  const steps = workflow.getSteps();
  const stepIds = steps.map(s => s.id);
  const referencedBy = findReferencedBy(name, workflows);
  const validationErrors = workflow.getValidationErrors();
  const created = workflow.getCreatedTimestamp();
  const referencingTool = `workflow_${name}`;

  let yamlText: string;
  try {
    yamlText = yaml.dump(workflow.jsonData, { lineWidth: 120, noRefs: true });
  } catch {
    yamlText = JSON.stringify(workflow.jsonData, null, 2);
  }

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

      <Box className={classes.column}>
        {/* Header */}
        <Box className={classes.header}>
          <Box className={classes.breadcrumb}>
            <Link
              to={withInstallation(mcpServersLink?.() ?? '#', installation)}
            >
              MCP Servers
            </Link>
            <ChevronRight />
            <Link to={withInstallation(workflowsLink?.() ?? '#', installation)}>
              Workflows
            </Link>
            <ChevronRight />
            <span>{name}</span>
          </Box>

          <Box className={classes.titleRow}>
            <Typography variant="h4" className={classes.title}>
              {name}
            </Typography>
            <AvailabilityBadge available={workflow.isValid()} />
            <Box className={classes.runAction}>
              {allowMutations ? (
                runButton
              ) : (
                <Tooltip title="Running a workflow mutates state. This installation is read-only (GitOps-managed); enable mutations in the muster proxy config to permit runs.">
                  <span>{runButton}</span>
                </Tooltip>
              )}
            </Box>
          </Box>

          {workflow.getDescription() && (
            <Box className={classes.description}>
              <MarkdownContent
                content={workflow.getDescription()!}
                dialect="gfm"
              />
            </Box>
          )}

          <Box className={classes.metaRow}>
            <span>
              namespace{' '}
              <code className={classes.mono}>
                {workflow.getNamespace() ?? '-'}
              </code>
            </span>
            <span>
              {steps.length} step{steps.length === 1 ? '' : 's'} ·{' '}
              {argEntries.length} argument{argEntries.length === 1 ? '' : 's'}
            </span>
            {created && (
              <span>
                Created <DateComponent value={created} relative tooltip />
              </span>
            )}
          </Box>
        </Box>

        {!workflow.isValid() && (
          <Alert severity="warning" style={{ marginTop: theme.spacing(2) }}>
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

        {/* Statistics */}
        <Box className={classes.section}>
          <SectionHeader
            icon={<BarChart />}
            title="Statistics"
            description="How often this workflow runs and how reliably, over a recent sample of executions."
          />
          <WorkflowStatsPanel name={name} installation={installation} />
        </Box>

        {/* Arguments */}
        <Box className={classes.section}>
          <SectionHeader
            icon={<Tune />}
            title="Arguments"
            description="Inputs the workflow takes when an agent invokes it."
          />
          {argEntries.length === 0 ? (
            <Typography variant="body2" color="textSecondary">
              This workflow takes no arguments.
            </Typography>
          ) : (
            <Box className={classes.argList}>
              {argEntries.map(([argName, def]) => (
                <Box key={argName} className={classes.argRow}>
                  <Box className={classes.argHead}>
                    <code className={classes.argName}>{argName}</code>
                    <span className={`${classes.badge} ${classes.badgeType}`}>
                      {def.type ?? 'string'}
                    </span>
                    {def.required && (
                      <span
                        className={`${classes.badge} ${classes.badgeRequired}`}
                      >
                        required
                      </span>
                    )}
                  </Box>
                  {def.description && (
                    <Typography
                      variant="body2"
                      className={classes.argDescription}
                    >
                      {def.description}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Steps */}
        <Box className={classes.section}>
          <SectionHeader
            icon={<FormatListNumbered />}
            title="Steps"
            description="The ordered tool calls muster runs. Each step names the aggregated tool it invokes and the arguments passed to it."
          />
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
                stepIds={stepIds}
              />
            ))
          )}
        </Box>

        {/* Referenced by */}
        {referencedBy.length > 0 && (
          <Box className={classes.section}>
            <SectionHeader
              icon={<Share />}
              title="Referenced by"
              description={`Other workflows that call this one as a step — muster exposes it as the tool ${referencingTool}.`}
            />
            <Box className={classes.refList}>
              {referencedBy.map(ref => (
                <Box
                  key={`${ref.cluster}/${ref.getName()}`}
                  className={classes.refRow}
                >
                  <AccountTree />
                  <Link
                    to={withInstallation(
                      workflowDetailLink?.({ name: ref.getName() }) ?? '#',
                      ref.cluster,
                    )}
                    className={classes.refLink}
                  >
                    {ref.getName()}
                  </Link>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {/* Raw definition */}
        <Box className={classes.section}>
          <Accordion variant="outlined" className={classes.yamlAccordion}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography className={classes.yamlSummary}>
                Definition (YAML)
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <pre className={classes.yamlPre}>{yamlText}</pre>
            </AccordionDetails>
          </Accordion>
        </Box>

        {/* Executions — run history + per-execution step results (muster proxy) */}
        <Box className={classes.section}>
          <SectionHeader
            icon={<History />}
            title="Executions"
            description="Past runs of this workflow and their per-step results, from the muster aggregator."
          />
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
        </Box>
      </Box>

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
 * steps, validity, step count) comes from the Workflow CR loaded by the
 * MusterInstanceProvider, while statistics, execution history, and runs use the
 * muster MCP proxy. Ported to the mockup's section rhythm (breadcrumb, header +
 * availability, statistics, arguments, numbered steps, referenced-by,
 * collapsible YAML).
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
