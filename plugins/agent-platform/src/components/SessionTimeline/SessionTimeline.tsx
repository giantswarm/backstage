import {
  ReactNode,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Flex, Text } from '@backstage/ui';
import { CircularProgress, makeStyles } from '@material-ui/core';
import { DateComponent } from '@giantswarm/backstage-plugin-ui-react';

import {
  SessionTimeline as Timeline,
  TimelineItem,
} from '../../lib/kagentTimeline';
import { countNoun, INITIAL_ROWS } from '../../lib/toolset';
import { TimelineEntry, type ConnectorOf } from './TimelineEntry';
import { WorkSummary } from './WorkSummary';
import {
  authorLabel,
  groupIntoTurns,
  isConversationSegment,
  isUserItem,
  openApprovalId,
  segmentTurn,
} from './helpers';
import { AgentAvatar } from '../AgentAvatar';
import type { EgressRemedy } from '../../lib/egressRemedy';

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
  // Where "Working…" was: the same slot, the same size, so the row turning from
  // progress into a warning reads as one thing changing state rather than a new
  // element arriving.
  stalled: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing(1.5),
    paddingTop: theme.spacing(1),
  },
  stalledText: {
    fontSize: '0.8125rem',
    color: theme.palette.warning.dark,
  },
  // Plain, not the shimmer: the row says what is being done about a stream that
  // went away, and a sheen across a sentence reads as decoration.
  streamLostText: {
    fontSize: '0.8125rem',
    color: theme.palette.text.secondary,
  },
}));

/**
 * How a turn is being followed once its live stream ended before the turn did.
 *
 * - `reconnecting`: the stream was cut — a kagent controller rollout cuts
 *   every stream in flight — and the page is resubscribing to the turn. The
 *   preview stays on screen and continues where it stopped once it is back.
 * - `checking`: the stream could not be picked up again, and the
 *   conversation is being re-read to find out how far the turn got — the
 *   moment the streamed text stopped mid-sentence, before anything says
 *   whether the turn finished.
 * - `following`: that read came back and the turn is still running. Its preview
 *   is gone for good; the poll delivers the reply when the turn ends.
 */
export type StreamLossPhase = 'reconnecting' | 'checking' | 'following';

const STREAM_LOST_LABELS: Record<StreamLossPhase, string> = {
  reconnecting: 'The live view was interrupted. Reconnecting…',
  checking: 'Could not restore the live view. Checking the result…',
  following:
    'Could not restore the live view. The agent is still working, and its reply appears when the turn finishes.',
};

/**
 * How many of the newest turns the timeline renders, and how many each *Show
 * earlier activity* press adds above them (T39). The backend reads up to 1000
 * tasks, and a long agentic session reaches hundreds of turns; the reader is
 * almost always here for the end of it. Paged rather than revealed all at
 * once, so going back a little never mounts the whole history.
 */
export const RECENT_TURNS = INITIAL_ROWS;

/** A rendered turn, by its position in the session's turns. */
function findTurn(
  container: HTMLElement | null,
  index: number,
): HTMLElement | null {
  return (
    container?.querySelector<HTMLElement>(`[data-turn-index="${index}"]`) ??
    null
  );
}

/** `HH:MM` in the reader's locale — the resolution a stall is worth stating at. */
function formatClockTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

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
      <AgentAvatar
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
  /** What an egress refusal's alert offers for this agent (`useEgressRemedy`). */
  egressRemedy?: EgressRemedy;
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
  /**
   * The turn's live stream ended before the turn did, and this is how the turn
   * is being followed instead. Read only while {@link isAgentWorking}: the
   * "Working…" row says so in place of its label, because a spinner alone over a
   * sentence that stopped half-way promises a continuation that is not coming
   * through the stream.
   */
  streamLost?: StreamLossPhase;
  /**
   * The newest turn is still active but has reported nothing since this
   * instant (epoch ms). The "Working…" row gives way to one saying so, with
   * {@link onCancelTurn} beside it — the honest display for a turn that
   * outlived its transport and never landed, where the alternative was an
   * empty composer over a session kagent still considers busy.
   */
  stalledSince?: number;
  /** Cancel the stalled turn server-side. Absent means the task is not known. */
  onCancelTurn?: () => void;
  /** A cancel has been asked for and the server has not answered yet. */
  isCancellingTurn?: boolean;
  /**
   * A caption for the session's first user message, when the portal wrote it
   * rather than the person (a meta-agent hand-off, UX review M20).
   */
  firstMessageCaption?: string;
  /** Names a tool call's connector in the plain register (UX review M2). */
  connectorOf?: ConnectorOf;
  /**
   * Whether the agent's tool activity is shown. Off leaves the conversation
   * and whatever waits on the person (see `isConversationSegment`); the
   * "Working…" row stays, so a turn in progress still says so.
   */
  showToolActivity?: boolean;
  /**
   * The session waits on the person (an input-required state), so its open
   * approval stays in sight with tool activity hidden.
   */
  isAwaitingPerson?: boolean;
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
  egressRemedy,
  agentAvatarUrl,
  isAgentWorking = false,
  streamLost,
  stalledSince,
  onCancelTurn,
  isCancellingTurn = false,
  firstMessageCaption,
  connectorOf,
  showToolActivity = true,
  isAwaitingPerson = false,
}: SessionTimelineProps) {
  const classes = useStyles();

  const turns = useMemo(() => groupIntoTurns(timeline.items), [timeline.items]);

  // The window counts from the newest turn, so a turn arriving while the agent
  // works joins it at the bottom and the oldest shown one leaves at the top —
  // the DOM stays bounded however long the session runs.
  const [windowSize, setWindowSize] = useState(RECENT_TURNS);
  // The long user messages shown whole, by kagent's message id where there is
  // one. Held here rather than in each bubble, which loses its state twice:
  // a sent message's optimistic copy gives way to kagent's under another key,
  // and the window above unmounts the oldest turn as a new one arrives.
  const [expandedMessages, setExpandedMessages] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const setMessageExpanded = useCallback((key: string, expanded: boolean) => {
    setExpandedMessages(previous => {
      const next = new Set(previous);
      if (expanded) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);
  const firstShown = Math.max(0, turns.length - windowSize);
  const listRef = useRef<HTMLDivElement>(null);
  // The turn that was first on screen when earlier ones were asked for, and
  // where it sat in the viewport: the reveal inserts above it, and the reader
  // keeps their place instead of being thrown to the oldest revealed turn.
  const scrollAnchor = useRef<{ index: number; top: number } | null>(null);

  const showEarlier = useCallback(() => {
    // The first turn on screen, which is not always `firstShown`: with tool
    // activity hidden a turn of nothing but work renders nothing.
    const anchor =
      listRef.current?.querySelector<HTMLElement>('[data-turn-index]');
    scrollAnchor.current = anchor
      ? {
          index: Number(anchor.dataset.turnIndex),
          top: anchor.getBoundingClientRect().top,
        }
      : null;
    setWindowSize(size => size + RECENT_TURNS);
  }, []);

  useLayoutEffect(() => {
    const anchor = scrollAnchor.current;
    scrollAnchor.current = null;
    if (!anchor) return;
    const element = findTurn(listRef.current, anchor.index);
    if (!element) return;
    // The page scrolls the document (SessionDetailPage), and measuring after
    // layout folds in whatever the browser's own scroll anchoring already did.
    const shift = element.getBoundingClientRect().top - anchor.top;
    if (shift !== 0) window.scrollBy(0, shift);
  }, [windowSize]);

  // Rendered in both branches below. An unreadable session produces *no* items
  // and a non-zero `skippedMessages`, so keeping this inside the populated branch
  // meant the one case the warning exists for — every history entry failing to
  // parse — reported "no messages yet" and never warned at all, presenting total
  // data loss as an ordinary empty session.
  const skippedAlert = timeline.skippedMessages > 0 && (
    <Alert
      status="warning"
      title="Could not read some messages"
      description={`${timeline.skippedMessages} ${
        timeline.skippedMessages === 1 ? 'message' : 'messages'
      } in this session could not be read and are not shown.`}
    />
  );

  // Rendered in both branches: the reply to a session's *first* message has an
  // empty conversation to appear into, which is exactly when the user has least
  // other evidence that anything is happening.
  //
  // A stalled turn takes the same slot. Never both: the page hands over one or
  // the other, and a spinner next to "no progress" would contradict itself.
  let workingRow: ReactNode = null;
  if (stalledSince !== undefined) {
    workingRow = (
      <div className={classes.stalled} role="status">
        <span className={classes.stalledText}>
          The agent has not reported progress since{' '}
          {formatClockTime(stalledSince)}.
        </span>
        {onCancelTurn && (
          <Button
            size="small"
            variant="secondary"
            isPending={isCancellingTurn}
            onPress={onCancelTurn}
          >
            Stop the turn
          </Button>
        )}
      </div>
    );
  } else if (isAgentWorking) {
    workingRow = (
      <div className={classes.working} aria-live="polite">
        <CircularProgress size={14} aria-hidden />
        {streamLost ? (
          <span className={classes.streamLostText}>
            {STREAM_LOST_LABELS[streamLost]}
          </span>
        ) : (
          <span className={classes.workingText}>Working…</span>
        )}
      </div>
    );
  }

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

  /*
   * No page-wide plain ⇄ technical switch: technical detail is a fold-out in
   * place (PO, 2026-10-10). A row outside a work summary reads plainly and
   * opens onto its exact call; a row inside one is technical, because opening
   * the summary was already the decision to see how the work was done.
   */
  const openApproval = showToolActivity
    ? undefined
    : openApprovalId(timeline.items, isAwaitingPerson);
  const firstUserMessageId = firstMessageCaption
    ? timeline.items.find(item => item.kind === 'user-message')?.id
    : undefined;
  const egressSettings = { agentName, remedy: egressRemedy };
  const renderEntry = (item: TimelineItem, technical = false) => {
    const messageKey =
      item.kind === 'user-message' ? (item.messageId ?? item.id) : undefined;
    return (
      <TimelineEntry
        key={item.id}
        item={item}
        isAgentWorking={isAgentWorking}
        technical={technical}
        caption={
          item.id === firstUserMessageId ? firstMessageCaption : undefined
        }
        isMessageExpanded={
          messageKey === undefined
            ? undefined
            : expandedMessages.has(messageKey)
        }
        onMessageExpandedChange={
          messageKey === undefined
            ? undefined
            : expanded => setMessageExpanded(messageKey, expanded)
        }
        connectorOf={connectorOf}
        egressSettings={egressSettings}
      />
    );
  };

  return (
    <Flex ref={listRef} direction="column" gap="3">
      {skippedAlert}

      {/* Nothing at all for a session within the window: a short session is
          read whole, with no paging chrome over it. */}
      {firstShown > 0 && (
        <Flex align="center" gap="2" data-testid="timeline-earlier-activity">
          <Button variant="tertiary" size="small" onPress={showEarlier}>
            Show earlier activity
          </Button>
          <Text variant="body-x-small" color="secondary">
            {countNoun(firstShown, 'earlier turn')} not shown
          </Text>
        </Flex>
      )}

      {turns.slice(firstShown).map((turn, offset) => {
        // The position in the whole session, not in the window: keys, the
        // newest-turn test and the scroll anchor all have to survive the
        // window moving.
        const turnIndex = firstShown + offset;
        const isLastTurn = turnIndex === turns.length - 1;
        const allSegments = segmentTurn(turn.items);
        const segments = showToolActivity
          ? allSegments
          : allSegments.filter(segment =>
              isConversationSegment(segment, openApproval),
            );
        // A turn of nothing but work (resumed by a decision with no words,
        // say) leaves no marker standing over nothing. Its number stays
        // taken, so the turns around it keep theirs.
        if (segments.length === 0) {
          return null;
        }
        // The agent's side of the turn opens with its name and face, once —
        // everything until the next user bubble is then implicitly the agent's.
        const entries: ReactNode[] = [];
        let needsHeader = true;
        segments.forEach((segment, segmentIndex) => {
          const first =
            segment.kind === 'item' ? segment.item : segment.items[0];
          if (isUserItem(first)) {
            needsHeader = true;
          } else if (needsHeader) {
            entries.push(
              <AgentHeader
                key={`author:${first.id}`}
                name={authorLabel(first, agentName) ?? 'Agent'}
                avatarUrl={agentAvatarUrl}
              />,
            );
            needsHeader = false;
          }
          if (segment.kind === 'item') {
            entries.push(renderEntry(segment.item));
            return;
          }
          // Live while the agent works and this is where its work lands: the
          // newest run of the newest turn, or a run with a call still out.
          const isLive =
            isAgentWorking &&
            ((isLastTurn && segmentIndex === segments.length - 1) ||
              segment.items.some(
                item =>
                  (item.kind === 'tool-call' || item.kind === 'agent-call') &&
                  item.isPending,
              ));
          entries.push(
            <WorkSummary
              key={`work:${segment.id}`}
              id={segment.id}
              items={segment.items}
              isLive={isLive}
              isAgentWorking={isAgentWorking}
            >
              {segment.items.map(item => renderEntry(item, true))}
            </WorkSummary>,
          );
        });

        return (
          // Keyed on the position in `turns`, not on `taskIndex`: `groupIntoTurns`
          // deliberately emits two turns with the same index if a task index ever
          // repeats non-contiguously, and a duplicate key would let React
          // reconcile one turn's entries under the other's timestamp.
          <Flex
            key={turnIndex}
            direction="column"
            gap="3"
            data-turn-index={turnIndex}
          >
            {/* Absolute, not relative: every turn of a session usually falls on
                the same day, so the relative form printed "1 day ago" three times
                and hid the progression entirely. An exact time shows how the
                session actually unfolded. Labelled with the turn's number: the
                first marker sits right under the header's "Started …", where a
                bare second time read as an unexplained timestamp (QA). */}
            <div className={classes.turnMarker}>
              <Text
                variant="body-small"
                color="secondary"
                className={classes.turnTime}
              >
                Turn {turnIndex + 1}
                {turn.at && (
                  <>
                    {' · '}
                    <DateComponent value={turn.at} />
                  </>
                )}
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
