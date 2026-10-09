import { Box, Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import { useApi } from '@backstage/frontend-plugin-api';
import { useQuery } from '@tanstack/react-query';
import {
  LoadingIndicator,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';
import { musterApiRef } from '../../apis';
import type { WorkflowExecutionSummary } from '../../apis/types';
import { formatDuration } from '../../lib/formatDuration';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { ServerPrefixInfo } from '../../lib/toolGrouping';
import {
  executionOutcome,
  failedStep,
  toolDisplay,
} from '../../lib/workflowDisplay';
import { DisclosureAccordion } from '../shared';

/** How many recent runs the section lists. */
const RECENT_RUNS_LIMIT = 10;

const useStyles = makeStyles((theme: Theme) => ({
  summaryRow: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.5, 2),
    textAlign: 'left',
  },
  outcome: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    fontWeight: 500,
  },
  meta: {
    color: 'var(--bui-fg-secondary)',
    fontSize: 12.5,
    whiteSpace: 'nowrap',
  },
  error: {
    flexBasis: '100%',
    color: 'var(--bui-fg-negative)',
    fontSize: 12.5,
    overflowWrap: 'anywhere',
  },
  trace: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
  },
  traceStep: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: theme.spacing(0.5, 1.5),
    fontSize: 13,
  },
  mono: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    wordBreak: 'break-all',
  },
  json: {
    margin: 0,
    marginTop: theme.spacing(1),
    padding: theme.spacing(1.25),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: theme.palette.action.hover,
    fontSize: 12,
    lineHeight: 1.5,
    overflowX: 'auto',
    maxHeight: 420,
  },
}));

/**
 * One run's per-step trace, read lazily (`GET /executions/:id` with steps)
 * when the row is expanded. Shows where a failed run stopped ("Failed at step
 * N"), each step's outcome and duration, skipped steps included; the technical
 * toggle adds the full execution record as JSON — resolved inputs, results and
 * errors per step.
 */
function RunTrace({
  executionId,
  installation,
  technical,
  prefixes,
}: {
  executionId: string;
  installation?: string;
  technical: boolean;
  prefixes: ServerPrefixInfo[];
}) {
  const classes = useStyles();
  const musterApi = useApi(musterApiRef);
  const { data, error, isLoading } = useQuery({
    queryKey: ['muster', 'workflow-execution', installation, executionId],
    queryFn: () => musterApi.getExecution(executionId, installation),
  });

  if (isLoading) {
    return <LoadingIndicator label="Reading the run…" />;
  }
  if (error || !data) {
    return (
      <Text as="p" variant="body-small" color="secondary">
        Could not read this run: {(error as Error | null)?.message ?? 'no data'}
      </Text>
    );
  }

  const failure = failedStep(data.steps);

  return (
    <Box>
      {data.status === 'failed' && (
        <Text as="p" variant="body-small" className={classes.error}>
          {failure
            ? `Failed at step ${failure.number} (${failure.step.step_id})${
                failure.step.error ? `: ${failure.step.error}` : ''
              }`
            : `Failed${data.error ? `: ${data.error}` : ''}`}
        </Text>
      )}
      <div className={classes.trace}>
        {(data.steps ?? []).map(step => {
          const outcome = executionOutcome(step.status);
          const display = toolDisplay(step.tool, prefixes);
          let plainTool: string;
          if (display.kind === 'connector') {
            plainTool = `${display.tool} (${display.connector})`;
          } else if (display.kind === 'workflow') {
            plainTool = `workflow ${display.workflow}`;
          } else {
            plainTool = display.tool;
          }
          return (
            <div key={step.step_id} className={classes.traceStep}>
              <StatusDot tone={outcome.tone} label={outcome.label} />
              <code className={classes.mono}>{step.step_id}</code>
              <span className={classes.meta}>
                {technical ? (
                  <code className={classes.mono}>{step.tool}</code>
                ) : (
                  plainTool
                )}
              </span>
              {step.status !== 'skipped' && (
                <span className={classes.meta}>
                  {formatDuration(step.duration_ms)}
                </span>
              )}
              {step.error && (
                <span className={classes.error}>{step.error}</span>
              )}
            </div>
          );
        })}
        {(data.steps ?? []).length === 0 && (
          <Text as="p" variant="body-small" color="secondary">
            No per-step records for this run.
          </Text>
        )}
      </div>
      {technical && (
        <pre className={classes.json}>{JSON.stringify(data, null, 2)}</pre>
      )}
    </Box>
  );
}

function RunSummary({ run }: { run: WorkflowExecutionSummary }) {
  const classes = useStyles();
  const outcome = executionOutcome(run.status);
  const when = formatRelativeTime(run.started_at);
  return (
    <span className={classes.summaryRow}>
      <span className={classes.outcome}>
        <StatusDot tone={outcome.tone} label={outcome.label} />
      </span>
      <span className={classes.meta} title={run.started_at}>
        {when ?? run.started_at}
      </span>
      <span className={classes.meta}>{formatDuration(run.duration_ms)}</span>
      <span className={classes.meta}>
        {run.step_count} step{run.step_count === 1 ? '' : 's'}
      </span>
      {run.status === 'failed' && run.error && (
        <span className={classes.error}>{run.error}</span>
      )}
    </span>
  );
}

export interface WorkflowRunsSectionProps {
  name: string;
  installation?: string;
  /** Whether the muster session can read executions. */
  hasSession: boolean;
  technical: boolean;
  prefixes: ServerPrefixInfo[];
}

/**
 * The workflow's recent runs: when each started, its outcome, duration and
 * step count, newest first. A run expands to its per-step trace (fetched on
 * expand), which names the step a failed run stopped at; the technical toggle
 * adds the full execution JSON. Run records are retention-bounded, so the
 * section says so rather than presenting the list as complete history.
 */
export function WorkflowRunsSection({
  name,
  installation,
  hasSession,
  technical,
  prefixes,
}: WorkflowRunsSectionProps) {
  const musterApi = useApi(musterApiRef);
  const { data, error, isLoading } = useQuery({
    queryKey: ['muster', 'workflow-recent-runs', installation, name],
    queryFn: () =>
      musterApi.listExecutions({
        workflowName: name,
        limit: RECENT_RUNS_LIMIT,
        installation,
      }),
    enabled: hasSession,
    staleTime: 30_000,
  });

  if (!hasSession) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        Run history is read through your muster session — connect above to see
        it.
      </Text>
    );
  }
  if (isLoading) {
    return <LoadingIndicator label="Reading the recent runs…" />;
  }
  if (error) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        Run history unavailable: {(error as Error).message}
      </Text>
    );
  }

  const runs = data?.executions ?? [];
  if (runs.length === 0) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        No runs of this workflow recorded yet.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="2">
      <Box>
        {runs.map(run => (
          <DisclosureAccordion
            key={run.execution_id}
            summary={<RunSummary run={run} />}
          >
            <RunTrace
              executionId={run.execution_id}
              installation={installation}
              technical={technical}
              prefixes={prefixes}
            />
          </DisclosureAccordion>
        ))}
      </Box>
      <Text as="p" variant="body-small" color="secondary">
        {data && data.total > runs.length
          ? `The newest ${runs.length} of ${data.total} recorded runs. `
          : ''}
        muster keeps run records for about three weeks (at most 10,000 runs).
      </Text>
    </Flex>
  );
}
