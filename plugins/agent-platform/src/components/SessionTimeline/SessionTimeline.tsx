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
import { ActivityDetail, groupIntoTurns, isActivityItem } from './helpers';

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

  const activityCount = useMemo(
    () => timeline.items.filter(isActivityItem).length,
    [timeline.items],
  );

  if (timeline.items.length === 0) {
    return (
      <Text variant="body-medium" color="secondary">
        This session has no messages yet.
      </Text>
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
        {activityCount > 0 && (
          <Flex align="center" gap="2">
            <Text variant="body-small" color="secondary">
              Agent activity
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
              <ToggleButton id="hidden">Hidden</ToggleButton>
              <ToggleButton id="collapsed">Collapsed</ToggleButton>
              <ToggleButton id="expanded">Expanded</ToggleButton>
            </ToggleButtonGroup>
          </Flex>
        )}
      </Flex>

      {timeline.skippedMessages > 0 && (
        <Alert
          status="warning"
          title="Some messages could not be read"
          description={`${timeline.skippedMessages} ${
            timeline.skippedMessages === 1 ? 'message' : 'messages'
          } in this session did not match the shape we expect from kagent and are not shown.`}
        />
      )}

      {turns.map(turn => {
        const visible =
          detail === 'hidden'
            ? turn.items.filter(item => !isActivityItem(item))
            : turn.items;
        if (visible.length === 0) {
          return null;
        }
        return (
          <Flex key={turn.taskIndex} direction="column" gap="3">
            <div className={classes.turnMarker}>
              <Text variant="body-small" color="secondary">
                {turn.at ? <DateComponent value={turn.at} relative /> : '—'}
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
