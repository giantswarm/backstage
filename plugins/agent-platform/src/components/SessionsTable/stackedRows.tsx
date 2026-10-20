import type { ReactNode } from 'react';
import { Badge, Flex, Skeleton } from '@backstage/ui';
import {
  StatusDot,
  type StackedRowItem,
} from '@giantswarm/backstage-plugin-ui-react';
import { useAgentAvatarUrl } from '../../hooks/useAgentAvatarUrl';
import { AvatarSize } from '../../lib/agentAvatar';
import { sessionStateDotVar } from '../../lib/stableClassNames';
import { AgentAvatar } from '../AgentAvatar';
import { SessionRow } from '../SessionsDataProvider/helpers';
import {
  SessionTableRow,
  STATE_IDLE_LABEL,
  STATE_UNKNOWN_LABEL,
} from './helpers';
import {
  EARLIER_REVISION_LABEL,
  EARLIER_REVISION_TITLE,
  RUNTIME_LOST_LABEL,
  RUNTIME_LOST_TITLE,
} from './cells';

/** The avatar is one line of text tall; request 2× for hi-dpi crispness. */
const FACT_AVATAR_SIZE: AvatarSize = 48;

/**
 * A missing state as a stacked row says it: out of the State column, a bare
 * "Unknown" or "Not loaded" would not say *what* is unknown. Opening the
 * session — the row's own press — shows the state, which is what the table's
 * `title=` explanations pointed at; a phone never shows those.
 */
export const STACKED_STATE_UNEVALUATED_LABEL = 'State not loaded';
export const STACKED_STATE_UNKNOWN_LABEL = `State ${STATE_UNKNOWN_LABEL.toLocaleLowerCase()}`;

/** The session's agent as a fact: its avatar, then its name. */
function AgentFact({
  row,
  buildAvatarUrl,
}: {
  row: SessionRow;
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--bui-space-1_5, 6px)',
        minWidth: 0,
      }}
    >
      <AgentAvatar
        size="small"
        purpose="decoration"
        name={row.agentName}
        src={
          buildAvatarUrl(row.installation, row.agentTechnicalName ?? '', {
            size: FACT_AVATAR_SIZE,
          }) ?? ''
        }
      />
      {row.agentName}
    </span>
  );
}

/** The state as a fact: its dot and its words, in the line's own type. */
function StateFact({
  row,
  isLoading,
}: {
  row: SessionTableRow;
  isLoading: boolean;
}): JSX.Element | null {
  const cell = row.stateCell;
  let tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' = 'neutral';
  let label: string;
  switch (cell.kind) {
    case 'unevaluated':
      if (isLoading) {
        return <Skeleton width="72px" height="12px" />;
      }
      label = STACKED_STATE_UNEVALUATED_LABEL;
      break;
    case 'unreadable':
      label = STACKED_STATE_UNKNOWN_LABEL;
      break;
    case 'idle':
      label = STATE_IDLE_LABEL;
      break;
    default:
      tone = cell.state.tone;
      label = cell.state.label;
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--bui-space-1_5, 6px)',
      }}
    >
      <StatusDot tone={tone} colorVar={sessionStateDotVar(tone)} />
      {label}
    </span>
  );
}

export type SessionStackedRowOptions = {
  row: SessionTableRow;
  href: string | undefined;
  buildAvatarUrl: ReturnType<typeof useAgentAvatarUrl>;
  /** Whether the states are still being read (a skeleton in their place). */
  isLoadingStates: boolean;
  /** Whether the list has states at all; without, the state fact is left out. */
  showState: boolean;
  showAgent: boolean;
  showInstallation: boolean;
  /** The row's time, as the list words it (a time, a date). */
  time: ReactNode;
  /** The row's pin and ⋯ menu, when the list offers them. */
  actions?: ReactNode;
};

/**
 * One session as a stacked row (T22 B1, C14), for the session lists at phone
 * width, where a table gives the title ~31px:
 *
 * - Line 1: the title — the link to the session, its hit area the whole row,
 *   wrapping to two lines — the runtime-lost mark, and the row's actions.
 * - Line 2: avatar and agent · state · environment · the row's time.
 *
 * The columns a page hides (an agent's own sessions hide the agent and the
 * environment) are left out of line 2 the same way.
 */
export function sessionStackedRow({
  row,
  href,
  buildAvatarUrl,
  isLoadingStates,
  showState,
  showAgent,
  showInstallation,
  time,
  actions,
}: SessionStackedRowOptions): StackedRowItem {
  return {
    id: row.id,
    title: row.title,
    href,
    status:
      row.runtimeLost || row.earlierRevision ? (
        // The words are the mark; the explanation is on the session's page,
        // which a press on the row opens.
        <Flex align="center" gap="1">
          {row.runtimeLost && (
            <Badge size="small" title={RUNTIME_LOST_TITLE}>
              {RUNTIME_LOST_LABEL}
            </Badge>
          )}
          {row.earlierRevision && (
            <Badge size="small" title={EARLIER_REVISION_TITLE}>
              {EARLIER_REVISION_LABEL}
            </Badge>
          )}
        </Flex>
      ) : undefined,
    facts: [
      // An unknown agent leaves no fact, rather than a dash between dots.
      showAgent && Boolean(row.agentName) && (
        <AgentFact key="agent" row={row} buildAvatarUrl={buildAvatarUrl} />
      ),
      showState && (
        <StateFact key="state" row={row} isLoading={isLoadingStates} />
      ),
      showInstallation && row.installation,
      time,
    ],
    actions,
  };
}
