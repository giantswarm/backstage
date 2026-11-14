import { Flex, Text } from '@backstage/ui';
import { makeStyles, Theme } from '@material-ui/core';
import {
  DateComponent,
  useDateTimeZone,
  StatusDot,
} from '@giantswarm/backstage-plugin-ui-react';
import type { WorkflowExecutionSummary } from '../../apis/types';
import { formatMilliseconds } from '@giantswarm/backstage-plugin-agent-platform-common';
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
  const isLocal = useDateTimeZone() === 'local';
  const classes = useStyles();
  const outcome = executionOutcome(run.status);
  return (
    <div className={classes.lastRun} data-testid="workflow-last-run">
      <Text as="span" variant="body-medium" weight="bold">
        Last run
      </Text>
      <StatusDot tone={outcome.tone} label={outcome.label} />
      <span className={classes.meta}>
        started{' '}
        <DateComponent
          value={run.started_at}
          relative={isLocal}
          disclosure={isLocal}
        />
      </span>
      {run.status !== 'inprogress' && (
        <span className={classes.meta}>
          took {formatMilliseconds(run.duration_ms)}
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
}

/**
 * The workflow's Statistics section: the last run, muster's own run totals
 * (completed/failed over every recorded run, not a sample), and the derived
 * statistics — success rate, durations, runs per day. It replaces both the
 * page's former run list and its "Runs" fact: a workflow's page answers how
 * it does, and a single run's step-by-step is drawn on the flow. Rendered
 * only with a muster session: the Usage tab shows its gate otherwise.
 */
export function WorkflowStatistics({
  name,
  installation,
}: WorkflowStatisticsProps) {
  const { latest } = useLatestRun(name, installation, true);
  const counts = useRunCounts(name, installation, true);

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
        Covers Muster's run records: about three weeks, at most 10,000 runs.
      </Text>
    </Flex>
  );
}
