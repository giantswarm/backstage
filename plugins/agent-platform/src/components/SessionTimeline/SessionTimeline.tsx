import { useMemo, useState } from 'react';
import {
  Alert,
  Flex,
  Text,
  ToggleButton,
  ToggleButtonGroup,
} from '@backstage/ui';
import { makeStyles } from '@material-ui/core';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';

import { SessionTimeline as Timeline } from '../../lib/kagentTimeline';
import { TimelineEntry } from './TimelineEntry';
import {
  ActivityDetail,
  groupIntoTurns,
  hasExpandableDetail,
  isActivityItem,
} from './helpers';

const useStyles = makeStyles(theme => ({
  turnMarker: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: theme.palette.divider,
  },
}));

export type SessionTimelineProps = {
  timeline: Timeline;
  /** Display name of the session's agent, used to label its messages. */
  agentName?: string;
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
export function SessionTimeline({ timeline, agentName }: SessionTimelineProps) {
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
              <Text variant="body-small" color="secondary">
                {turn.at ? <DateComponent value={turn.at} /> : '—'}
              </Text>
              <span className={classes.rule} />
            </div>
            {visible.map(item => (
              <TimelineEntry
                // Keyed on the detail setting as well as the item: an
                // AccordionGroup's expanded set is only read on mount, so the
                // global control takes effect by remounting the entries.
                key={`${item.id}:${detail}`}
                item={item}
                resolvedAgentName={agentName}
                defaultExpanded={detail === 'expanded'}
              />
            ))}
          </Flex>
        );
      })}
    </Flex>
  );
}
