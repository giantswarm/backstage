import { useMemo } from 'react';
import { LinearProgress } from '@material-ui/core';
import CancelIcon from '@material-ui/icons/Cancel';
import CheckCircleIcon from '@material-ui/icons/CheckCircle';
import ErrorIcon from '@material-ui/icons/Error';
import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import { Link } from '@backstage/core-components';
import { useRouteRef } from '@backstage/frontend-plugin-api';
import { Button, Flex, Text } from '@backstage/ui';
import {
  InfoCard,
  StatusLabel,
  type StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  useCancelJob,
  usePullJobs,
  type PullJob,
} from '../../hooks/usePullJobs';
import { isJobActive, type ModelManagerJobPhase } from '../../lib/modelManager';
import { formatBytes } from '../../lib/modelManagerServing';
import { modelDetailRouteRef } from '../../routes';

/** How many finished jobs to keep on screen; the active ones always show. */
const MAX_FINISHED_JOBS = 5;

export const JOB_PHASE_PRESENTATION: Record<
  ModelManagerJobPhase,
  { label: string; intent: StatusLabelIntent; icon: typeof CheckCircleIcon }
> = {
  pending: { label: 'Queued', intent: 'neutral', icon: HourglassEmptyIcon },
  running: { label: 'Downloading', intent: 'info', icon: HourglassEmptyIcon },
  succeeded: { label: 'Done', intent: 'positive', icon: CheckCircleIcon },
  failed: { label: 'Failed', intent: 'negative', icon: ErrorIcon },
  cancelled: { label: 'Cancelled', intent: 'neutral', icon: CancelIcon },
};

/** "123 MiB / 400 MiB (31%)", or what is known of it. */
export function formatJobProgress(job: PullJob): string {
  const parts: string[] = [];
  if (job.bytesTotal) {
    parts.push(
      `${formatBytes(job.bytesCompleted ?? 0)} / ${formatBytes(job.bytesTotal)}`,
    );
  } else if (job.bytesCompleted) {
    parts.push(formatBytes(job.bytesCompleted));
  }
  if (job.percent !== undefined && job.bytesTotal) {
    parts.push(`(${Math.round(job.percent)}%)`);
  }
  return parts.join(' ');
}

/**
 * Whether a ModelConfig still exists on an installation: `true`/`false` when
 * the caller has read the list, `undefined` when it cannot tell (still
 * loading, no permission) — then the link is offered as before.
 */
export type ModelConfigExists = (
  installation: string,
  namespace: string,
  name: string,
) => boolean | undefined;

function PullJobRow({
  job,
  modelConfigExists,
}: {
  job: PullJob;
  modelConfigExists?: ModelConfigExists;
}) {
  const cancel = useCancelJob(job.installation);
  const modelDetailRoute = useRouteRef(modelDetailRouteRef);
  const presentation = JOB_PHASE_PRESENTATION[job.phase];
  const active = isJobActive(job);
  const progress = formatJobProgress(job);
  const wired = job.result;
  // A finished job remembers the ModelConfig it wired; the model may since
  // have been deleted (unwired). Never link to a page that 404s.
  const wiredExists = wired
    ? modelConfigExists?.(job.installation, wired.namespace, wired.name)
    : undefined;
  const wiredHref =
    wired &&
    wiredExists !== false &&
    modelDetailRoute?.({
      installation: job.installation,
      namespace: wired.namespace,
      name: wired.name,
    });
  let wiredOutcome = 'was created.';
  if (wiredExists === false) {
    wiredOutcome = 'was created and has since been removed.';
  } else if (wired?.ready) {
    wiredOutcome = 'is ready for agents.';
  }

  return (
    <Flex direction="column" gap="1" data-testid={`pull-job-${job.id}`}>
      <Flex justify="between" align="center" gap="3">
        <Flex direction="column" gap="0.5" style={{ minWidth: 0 }}>
          <Text as="p" variant="body-medium" weight="bold" truncate>
            {job.model}
          </Text>
          <Text variant="body-small" color="secondary" truncate>
            {job.installation}
            {job.status && active ? ` · ${job.status}` : ''}
            {progress ? ` · ${progress}` : ''}
          </Text>
        </Flex>
        <Flex align="center" gap="2">
          <StatusLabel
            label={presentation.label}
            intent={presentation.intent}
            icon={presentation.icon}
            title={job.error}
          />
          {active && (
            <Button
              variant="secondary"
              size="small"
              isPending={cancel.isPending}
              onClick={() => cancel.mutate(job.id)}
            >
              Cancel
            </Button>
          )}
        </Flex>
      </Flex>

      {active && (
        <LinearProgress
          aria-label={`Downloading ${job.model}`}
          variant={job.bytesTotal ? 'determinate' : 'indeterminate'}
          value={job.bytesTotal ? Math.min(100, job.percent ?? 0) : undefined}
        />
      )}

      {job.phase === 'failed' && job.error && (
        <Text variant="body-small" color="danger">
          {job.error}
        </Text>
      )}

      {job.phase === 'succeeded' && wired && (
        <Text variant="body-small" color="secondary">
          Model config{' '}
          {wiredHref ? (
            <Link to={wiredHref}>
              {wired.namespace}/{wired.name}
            </Link>
          ) : (
            `${wired.namespace}/${wired.name}`
          )}{' '}
          {wiredOutcome}
        </Text>
      )}

      {cancel.error && (
        <Text variant="body-small" color="danger">
          Could not cancel: {(cancel.error as Error).message}
        </Text>
      )}
    </Flex>
  );
}

export type PullJobsPanelProps = {
  /** Installations whose backend reports the `pull` capability. */
  installations: string[];
  /** Whether a wired ModelConfig still exists, so a finished job does not link to a deleted one. */
  modelConfigExists?: ModelConfigExists;
};

/**
 * The downloads of the installations that can pull: every running job with
 * its progress, and the last few finished ones with their outcome — including
 * the ModelConfig a successful pull wired, linked.
 *
 * Renders nothing while there is nothing to show, so an installation that has
 * never pulled anything does not carry an empty card. Jobs are model-manager's
 * in-memory list; a restart forgets them, and so does this panel.
 */
export function PullJobsPanel({
  installations,
  modelConfigExists,
}: PullJobsPanelProps) {
  const { jobs, errors } = usePullJobs(installations);

  const shown = useMemo(() => {
    const active = jobs.filter(isJobActive);
    const finished = jobs.filter(job => !isJobActive(job));
    return [...active, ...finished.slice(0, MAX_FINISHED_JOBS)];
  }, [jobs]);

  if (shown.length === 0 && errors.length === 0) {
    return null;
  }

  return (
    <InfoCard title="Model downloads">
      <Flex direction="column" gap="4">
        {shown.map(job => (
          <PullJobRow
            key={`${job.installation}/${job.id}`}
            job={job}
            modelConfigExists={modelConfigExists}
          />
        ))}
        {errors.map(({ installation, error }) => (
          <Text key={installation} variant="body-small" color="danger">
            Could not read the downloads of {installation}: {error.message}
          </Text>
        ))}
      </Flex>
    </InfoCard>
  );
}
