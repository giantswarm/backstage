import HourglassEmptyIcon from '@material-ui/icons/HourglassEmpty';
import { Flex, Link, Text } from '@backstage/ui';
import {
  StatusLabel,
  StatusLabelIntent,
} from '@giantswarm/backstage-plugin-ui-react';
import { formatDuration, PhaseItem, PhaseState } from '../../lib/phases';

const INTENT: Record<PhaseState, StatusLabelIntent> = {
  done: 'positive',
  pending: 'info',
  failed: 'negative',
  ahead: 'neutral',
};

/** The time of day a phase was reached, as the manager stamps it (UTC). */
const clock = (iso: string) => `${iso.slice(11, 19)}Z`;

/**
 * When a done phase was reached: the first one by the clock, the ones after
 * by the time since the first (the creation, the dispatch), with the
 * manager's own count since the phase before when it differs.
 */
function timing(phase: PhaseItem): string | undefined {
  if (phase.state !== 'done' || !phase.at) {
    return undefined;
  }
  if (!phase.sinceStart) {
    return `at ${clock(phase.at)}`;
  }
  const since = `after ${formatDuration(phase.sinceStart)}`;
  return phase.seconds && phase.seconds !== phase.sinceStart
    ? `${since} (+${formatDuration(phase.seconds)})`
    : since;
}

function PhaseRow({ phase }: { phase: PhaseItem }) {
  const when = timing(phase);
  return (
    <li
      data-testid={`phase-${phase.name}`}
      data-state={phase.state}
      style={{ opacity: phase.state === 'ahead' ? 0.6 : 1 }}
    >
      <Flex direction="column" gap="1">
        <Flex align="center" gap="3" style={{ flexWrap: 'wrap' }}>
          <StatusLabel
            label={phase.label}
            intent={INTENT[phase.state]}
            icon={phase.state === 'pending' ? HourglassEmptyIcon : undefined}
            title={phase.at}
          />
          {/* The spaces keep the row readable as text (copied, read aloud); flex layout drops them. */}
          {when && (
            <Text variant="body-small" color="secondary">
              {' '}
              {when}
            </Text>
          )}
          {phase.detail && <Text variant="body-small"> {phase.detail}</Text>}
          {phase.link && (
            <Text variant="body-small">
              {' '}
              <Link
                href={phase.link.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {phase.link.text} ↗
              </Link>
            </Text>
          )}
        </Flex>
        {phase.reason && (
          <Text
            variant="body-small"
            color={phase.state === 'failed' ? 'danger' : 'secondary'}
            style={{ paddingLeft: 28 }}
          >
            {' '}
            {phase.reason}
          </Text>
        )}
      </Flex>
    </li>
  );
}

/**
 * The phases of a set-up, one per line in the order they are reached: done
 * with when (the clock for the first, the time since it for the rest, the
 * manager's count since the phase before in brackets), the one waiting with
 * the manager's reason, the one that failed with its reason, the rest
 * dimmed. Presentation only: the items come from `lib/phases`.
 */
export function PhaseList({
  phases,
  'data-testid': testId,
}: {
  phases: PhaseItem[];
  'data-testid'?: string;
}) {
  return (
    <ol
      data-testid={testId}
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {phases.map(phase => (
        <PhaseRow key={phase.name} phase={phase} />
      ))}
    </ol>
  );
}
