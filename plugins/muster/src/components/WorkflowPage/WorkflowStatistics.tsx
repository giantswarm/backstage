import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import {
  DateComponent,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';
import type { WorkflowExecutionSummary } from '../../apis/types';
import { formatDuration } from '../../lib/formatDuration';
import { formatRelativeTime } from '../../lib/formatRelativeTime';
import { executionOutcome } from '../../lib/workflowDisplay';
import { WorkflowStatsPanel } from '../WorkflowDetailPage/WorkflowStatsPanel';
import { useLatestRun, useRunCounts } from './useLatestRun';

const useStyles = makeStyles((theme: Theme) => ({
  lastRun: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing(0.5, 2),
  },
  meta: {
    color: 'var(--bui-fg-secondary)',
    fontSize: 13,
  },
  error: {
    flexBasis: '100%',
    color: 'var(--bui-fg-negative)',
    fontSize: 13,
    overflowWrap: 'anywhere',
  },
}));

/**
 * The newest run in one line: its outcome, when (relative, and to the minute
 * as text — a phone shows no hover title), how long it took, and a failed
 * run's error. Where it stopped step by step is on the flow above, which the
 * same run colours.
 */
function LastRun({ run }: { run: WorkflowExecutionSummary }) {
  const classes = useStyles();
  const outcome = executionOutcome(run.status);
  const when = formatRelativeTime(run.started_at);
  return (
    <div className={classes.lastRun} data-testid="workflow-last-run">
      <Text as="span" variant="body-medium" weight="bold">
        Last run
      </Text>
      <StatusDot tone={outcome.tone} label={outcome.label} />
      {when && <span className={classes.meta}>{when}</span>}
      <span className={classes.meta}>
        started <DateComponent value={run.started_at} />
      </span>
      {run.status !== 'inprogress' && (
        <span className={classes.meta}>
          took {formatDuration(run.duration_ms)}
        </span>
      )}
      {run.status === 'failed' && run.error && (
        <span className={classes.error}>{run.error}</span>
      )}
    </div>
  );
}

export interface WorkflowStatisticsProps {
  name: string;
  installation?: string;
  /** Whether the muster session can read executions. */
  hasSession: boolean;
}

/**
 * The workflow's Statistics section: the last run, muster's own run totals
 * (completed/failed over every recorded run, not a sample), and the derived
 * statistics — success rate, durations, runs per day. It replaces both the
 * page's former run list and its "Runs" fact: a workflow's page answers how
 * it does, and a single run's step-by-step is drawn on the flow.
 */
export function WorkflowStatistics({
  name,
  installation,
  hasSession,
}: WorkflowStatisticsProps) {
  const { latest } = useLatestRun(name, installation, hasSession);
  const counts = useRunCounts(name, installation, hasSession);

  if (!hasSession) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        Connect to muster above to see statistics.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="4">
      {latest && <LastRun run={latest} />}
      <WorkflowStatsPanel
        name={name}
        installation={installation}
        totals={
          counts && { completed: counts.succeeded, failed: counts.failed }
        }
      />
      <Text as="p" variant="body-small" color="secondary">
        Covers muster's run records: about three weeks, at most 10,000 runs.
      </Text>
    </Flex>
  );
}
