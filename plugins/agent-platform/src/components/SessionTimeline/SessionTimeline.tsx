import { ReactNode, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Flex,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { CircularProgress, makeStyles } from '@material-ui/core';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';

import { SessionTimeline as Timeline } from '../../lib/kagentTimeline';
import { TimelineEntry } from './TimelineEntry';
import {
  ActivityDetail,
  authorLabel,
  groupIntoTurns,
  hasExpandableDetail,
  isActivityItem,
} from './helpers';

const useStyles = makeStyles(theme => ({
  turnMarker: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1.5),
    marginTop: theme.spacing(2),
  },
  turnTime: {
    whiteSpace: 'nowrap',
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: theme.palette.divider,
  },
  authorHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  authorName: {
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  working: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    paddingTop: theme.spacing(1),
  },
  // The agent is doing something unseen; a light sheen across the label says
  // "in motion" the way a static spinner alone does not.
  workingText: {
    fontSize: '0.8125rem',
    backgroundImage: `linear-gradient(90deg, ${theme.palette.text.secondary} 0%, ${theme.palette.text.primary} 50%, ${theme.palette.text.secondary} 100%)`,
    backgroundSize: '200% 100%',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
    animation: '$shimmer 2.2s linear infinite',
    '@media (prefers-reduced-motion)': {
      animation: 'none',
      color: theme.palette.text.secondary,
      WebkitTextFillColor: 'unset',
    },
  },
  '@keyframes shimmer': {
    '0%': { backgroundPosition: '200% 0' },
    '100%': { backgroundPosition: '-200% 0' },
  },
}));

/**
 * Who is speaking, at the start of the agent's side of a turn.
 *
 * Once per block rather than on every message: between the header and the next
 * user bubble, everything is the agent's — repeating its name over each
 * paragraph and tool row is noise.
 */
function AgentHeader({
  name,
  avatarUrl,
}: {
  name: string;
  avatarUrl?: string;
}) {
  const classes = useStyles();
  return (
    <div className={classes.authorHeader}>
      <Avatar
        size="small"
        purpose="decoration"
        name={name}
        src={avatarUrl ?? ''}
      />
      <span className={classes.authorName}>{name}</span>
    </div>
  );
}

export type SessionTimelineProps = {
  timeline: Timeline;
  /** Display name of the session's agent, used to label its messages. */
  agentName?: string;
  /** The agent's avatar, shown where its side of a turn begins. */
  agentAvatarUrl?: string;
  /**
   * Whether the agent is mid-turn, in which case the conversation ends with a
   * "Working…" row where the reply will appear.
   *
   * Must mean *working* and not merely "not finished": a task waiting on a human
   * (`input-required`) is also unfinished, and a spinner there would promise
   * progress that will never come on its own. The page derives this.
   */
  isAgentWorking?: boolean;
};

/**
 * The session's conversation, grouped into turns.
 *
 * **Timestamps are per turn, not per item.** A2A messages carry no time of their
 * own, and kagent's stored events — which looked like a source for one — turned out
 * to be ADK events with no `messageId` to correlate against. So a task's timestamp
 * is the finest granularity that exists, and it is shown once per turn rather than
 * repeated on every item, which would imply precision we don't have.
 */
export function SessionTimeline({
  timeline,
  agentName,
  agentAvatarUrl,
  isAgentWorking = false,
}: SessionTimelineProps) {
  const classes = useStyles();
  // Collapsed by default: the agent's working is why this screen is worth opening,
  // but a wall of expanded tool payloads is unreadable.
  const [detail, setDetail] = useState<ActivityDetail>('collapsed');

  const turns = useMemo(() => groupIntoTurns(timeline.items), [timeline.items]);

  // Offered whenever *anything* can expand — not just when there is agent
  // activity. An approval is excluded from `hidden` (it records the user's own
  // decision, so hiding it would erase their action) but it still expands and
  // collapses, so a session whose only collapsible entry is an approval must still
  // get the control. Keying this on activity alone left such sessions with a
  // collapsed panel and no way to open them all.
  const hasExpandable = useMemo(
    () => timeline.items.some(hasExpandableDetail),
    [timeline.items],
  );

  // Whether `hidden` would actually remove anything, which decides if that option
  // is worth offering.
  const hasActivity = useMemo(
    () => timeline.items.some(isActivityItem),
    [timeline.items],
  );

  // Rendered in both branches below. An unreadable session produces *no* items
  // and a non-zero `skippedMessages`, so keeping this inside the populated branch
  // meant the one case the warning exists for — every history entry failing to
  // parse — reported "no messages yet" and never warned at all, presenting total
  // data loss as an ordinary empty session.
  const skippedAlert = timeline.skippedMessages > 0 && (
    <Alert
      status="warning"
      title="Some messages could not be read"
      description={`${timeline.skippedMessages} ${
        timeline.skippedMessages === 1 ? 'message' : 'messages'
      } in this session did not match the shape we expect from kagent and are not shown.`}
    />
  );

  // Rendered in both branches: the reply to a session's *first* message has an
  // empty conversation to appear into, which is exactly when the user has least
  // other evidence that anything is happening.
  const workingRow = isAgentWorking && (
    <div className={classes.working} aria-live="polite">
      <CircularProgress size={14} aria-hidden />
      <span className={classes.workingText}>Working…</span>
    </div>
  );

  if (timeline.items.length === 0) {
    return (
      <Flex direction="column" gap="3">
        {skippedAlert}
        <Text variant="body-medium" color="secondary">
          {timeline.skippedMessages > 0
            ? // "No messages yet" would be a lie here: there were messages, we
              // just could not read any of them.
              'None of this session’s messages could be displayed.'
            : 'This session has no messages yet.'}
        </Text>
        {workingRow}
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="3">
      <Flex
        align="center"
        justify="between"
        gap="2"
        style={{ flexWrap: 'wrap' }}
      >
        <Text variant="title-small">Timeline</Text>
        {hasExpandable && (
          <Flex align="center" gap="2">
            <Text variant="body-small" color="secondary">
              Details
            </Text>
            <ToggleButtonGroup
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[detail]}
              onSelectionChange={keys => {
                const next = [...keys][0];
                if (
                  next === 'hidden' ||
                  next === 'collapsed' ||
                  next === 'expanded'
                ) {
                  setDetail(next);
                }
              }}
            >
              {/* Only offered when it would remove something. `hidden` drops the
                  agent's working, and approvals are not part of that — so a session
                  whose only collapsible entry is an approval gets expand/collapse
                  but nothing to hide. */}
              {hasActivity && <ToggleButton id="hidden">Hidden</ToggleButton>}
              <ToggleButton id="collapsed">Collapsed</ToggleButton>
              <ToggleButton id="expanded">Expanded</ToggleButton>
            </ToggleButtonGroup>
          </Flex>
        )}
      </Flex>

      {skippedAlert}

      {turns.map((turn, turnIndex) => {
        const visible =
          detail === 'hidden'
            ? turn.items.filter(item => !isActivityItem(item))
            : turn.items;
        if (visible.length === 0) {
          return null;
        }

        // The agent's side of the turn opens with its name and face, once —
        // everything until the next user bubble is then implicitly the agent's.
        const entries: ReactNode[] = [];
        let needsHeader = true;
        for (const item of visible) {
          if (item.kind === 'user-message') {
            needsHeader = true;
          } else if (needsHeader) {
            entries.push(
              <AgentHeader
                key={`author:${item.id}`}
                name={authorLabel(item, agentName) ?? 'Agent'}
                avatarUrl={agentAvatarUrl}
              />,
            );
            needsHeader = false;
          }
          entries.push(
            <TimelineEntry
              // Keyed on the detail setting as well as the item: an entry's
              // expanded state is only read on mount, so the global control
              // takes effect by remounting the entries.
              key={`${item.id}:${detail}`}
              item={item}
              defaultExpanded={detail === 'expanded'}
              isAgentWorking={isAgentWorking}
            />,
          );
        }

        return (
          // Keyed on the position in `turns`, not on `taskIndex`: `groupIntoTurns`
          // deliberately emits two turns with the same index if a task index ever
          // repeats non-contiguously, and a duplicate key would let React
          // reconcile one turn's entries under the other's timestamp.
          <Flex key={turnIndex} direction="column" gap="3">
            {/* Absolute, not relative: every turn of a session usually falls on
                the same day, so the relative form printed "1 day ago" three times
                and hid the progression entirely. An exact time shows how the
                session actually unfolded. */}
            <div className={classes.turnMarker}>
              <Text
                variant="body-small"
                color="secondary"
                className={classes.turnTime}
              >
                {turn.at ? <DateComponent value={turn.at} /> : '—'}
              </Text>
              <span className={classes.rule} />
            </div>
            {entries}
          </Flex>
        );
      })}
      {workingRow}
    </Flex>
  );
}
