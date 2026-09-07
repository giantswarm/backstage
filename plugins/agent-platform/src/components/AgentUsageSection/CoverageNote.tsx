import { Text } from '@backstage/ui';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';
import { SessionUsageResponse } from '@giantswarm/backstage-plugin-agent-platform-common';
import { formatCount } from '../../lib/formatNumbers';

export type CoverageNoteProps = {
  usage: SessionUsageResponse;
  /** False on an installation whose kagent does not scope to the caller. */
  isPersonal: boolean;
};

/**
 * What the summary does and does not cover.
 *
 * Keeps the distinction the backend draws: `skipped` is "should have been
 * evaluated and was not" (the cap, or the pass budget), `unreadable` is "asked
 * and failed". They are different facts and a reader can act on only one of
 * them, so they are worded separately.
 *
 * `evaluatedAt` is shown whenever it is known, not only when coverage is
 * partial: the summary is cached for minutes, and a 30-day total with no visible
 * timestamp is exactly the kind of number that gets quoted as current.
 */
export function CoverageNote({ usage, isPersonal }: CoverageNoteProps) {
  const { skipped, unreadable, undatedTurns, totals, evaluatedAt } = usage;
  const parts: string[] = [];

  const sessions = formatCount(totals.sessions);
  parts.push(
    isPersonal
      ? `Based on your ${sessions} most recent sessions with activity in the window.`
      : `Based on the ${sessions} most recent sessions with activity in the window.`,
  );

  if (skipped > 0) {
    parts.push(
      `${formatCount(skipped)} more were not read, so these totals are a lower bound.`,
    );
  }
  if (unreadable.length > 0) {
    parts.push(
      `${formatCount(unreadable.length)} could not be read at all and are not counted.`,
    );
  }
  if (undatedTurns > 0) {
    parts.push(
      `${formatCount(undatedTurns)} turns carry no timestamp, so they are in the totals but in no day.`,
    );
  }

  return (
    <Text variant="body-small" color="secondary">
      {parts.join(' ')}
      {evaluatedAt > 0 && (
        <>
          {' Evaluated '}
          <DateComponent value={new Date(evaluatedAt).toISOString()} />.
        </>
      )}
    </Text>
  );
}
