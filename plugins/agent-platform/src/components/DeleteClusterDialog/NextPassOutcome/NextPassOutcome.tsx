import type { ReactNode } from 'react';
import { Button, Text } from '@backstage/ui';
import { joinNames } from '@giantswarm/backstage-plugin-ui-react';

import type { ClusterWriteResult } from '../../../lib/clusterManager';
import {
  REMOVAL_CHECK_INTERVAL_MS,
  REMOVAL_CHECK_WINDOW_MS,
  describeNextObject,
  formatClock,
  objectsAre,
  onlyDeletes,
  type NextPass,
} from '../removalPasses';

export type NextPassOutcomeProps = {
  /** The judged dry run; absent when the check failed. */
  next: NextPass | undefined;
  at: Date;
  /** The dialog stopped checking: what is left is not cluster-manager's, or the round ran out. */
  paused: boolean;
  /** The last pass's answer: what it said already is not said again. */
  last: ClusterWriteResult;
  finishButton: ReactNode;
  onCheckAgain: () => void;
  isBusy: boolean;
};

/**
 * What the dry run after the last pass says: Finish removal once another pass
 * would change something new, else what the removal waits for, said once,
 * and when the dialog checked.
 */
export function NextPassOutcome({
  next,
  at,
  paused,
  last,
  finishButton,
  onCheckAgain,
  isBusy,
}: NextPassOutcomeProps) {
  if (next?.state === 'ready') {
    return (
      <>
        <Text variant="body-small">
          {objectsAre(next.objects)} left to{' '}
          {onlyDeletes(next.objects) ? 'remove' : 'change'} now:{' '}
          {joinNames(next.objects.map(describeNextObject))}.
        </Text>
        {finishButton}
      </>
    );
  }
  const checkAgain = paused && (
    <div>
      <Button
        variant="secondary"
        size="small"
        onPress={onCheckAgain}
        isDisabled={isBusy}
      >
        Check again
      </Button>
    </div>
  );
  let when = `Checked at ${formatClock(at)}.`;
  if (!next) {
    when = `Could not check what is left at ${formatClock(at)}.`;
  }
  if (!paused) {
    when += ` The dialog checks again every ${
      REMOVAL_CHECK_INTERVAL_MS / 1000
    } seconds and offers Finish removal once there is more to do.`;
  } else if (next?.state !== 'stuck') {
    when += ` The dialog stopped checking after ${
      REMOVAL_CHECK_WINDOW_MS / 60_000
    } minutes.`;
  }
  const checked = (
    <Text variant="body-small" color="secondary">
      {when}
    </Text>
  );
  if (!next) {
    // The check failed (shown above): the pass itself may still go through.
    return (
      <>
        {checked}
        {checkAgain}
        {finishButton}
      </>
    );
  }
  if (next.state === 'waiting') {
    return (
      <>
        {next.reason !== last.nextStep && (
          <Text variant="body-small">{next.reason}</Text>
        )}
        {checked}
        {checkAgain}
      </>
    );
  }
  const known = last.warnings ?? [];
  return (
    <>
      <Text variant="body-small">
        What is left is not cluster-manager's to remove.
      </Text>
      {next.warnings
        .filter(warning => !known.includes(warning))
        .map(warning => (
          <Text key={warning} variant="body-small">
            {warning}
          </Text>
        ))}
      {checked}
      {checkAgain}
    </>
  );
}
