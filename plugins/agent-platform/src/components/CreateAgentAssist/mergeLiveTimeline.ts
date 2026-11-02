import type { PendingMessage } from '../../hooks/useSendMessage';
import type { StreamTurn } from '../../lib/kagentStreamTurn';
import type { SessionTimeline, TimelineItem } from '../../lib/kagentTimeline';
import {
  createPolledPairing,
  fresherStreamedCopy,
} from '../SessionDetailPage/helpers';

/**
 * The polled conversation with the in-flight turn appended: the message just
 * sent, the streamed items the poll has not delivered yet, and the text still
 * being produced.
 *
 * A pure extraction of the session detail page's `timelineWithLive` merge for
 * the assist panel, minus the page's stall and turn-failure special cases: the
 * stand-in and every streamed item retire by **recognition** — once a poll
 * returns a copy carrying the same `messageId`, the real one is on screen —
 * and a polled copy that lags its streamed one is advanced in place
 * (`fresherStreamedCopy`) rather than shown twice.
 */
export function mergeLiveTimeline(
  timeline: SessionTimeline,
  pending: PendingMessage | null,
  stream: StreamTurn | null,
): SessionTimeline {
  const pendingVisible =
    pending &&
    !timeline.items.some(item => item.messageId === pending.messageId);
  const streamVisible =
    stream && (stream.items.length > 0 || Boolean(stream.live));

  if (!pendingVisible && !streamVisible) {
    return timeline;
  }

  // The turn these additions belong to: the sent message's task once a poll
  // has seen it, else one past the newest polled turn.
  const sentMessageId = stream?.sentMessageId ?? pending?.messageId;
  const sentItem = sentMessageId
    ? timeline.items.find(item => item.messageId === sentMessageId)
    : undefined;
  const taskIndex =
    sentItem?.taskIndex ?? (timeline.items.at(-1)?.taskIndex ?? -1) + 1;

  const items = [...timeline.items];

  if (pendingVisible) {
    items.push({
      kind: 'user-message' as const,
      id: `pending:${pending.messageId}`,
      messageId: pending.messageId,
      taskIndex,
      text: pending.text,
    });
  }

  if (streamVisible) {
    const pairWithPolled = createPolledPairing(timeline.items);
    /**
     * Whether the poll holds a copy of a streamed item — which then stays,
     * advanced by whatever the stream has seen since that read.
     */
    const advance = (streamed: TimelineItem): boolean => {
      const at = pairWithPolled(streamed);
      if (at === undefined) {
        return false;
      }
      items[at] = fresherStreamedCopy(items[at], streamed) ?? items[at];
      return true;
    };
    // The poll having closed this turn is what retires a streamed ending that
    // carries no messageId of its own — see the session detail page.
    const polledEndedTurn = timeline.items.some(
      item => item.kind === 'turn-failed' && item.taskIndex === taskIndex,
    );
    for (const item of stream.items) {
      if (advance(item)) {
        continue;
      }
      if (item.kind === 'turn-failed' && polledEndedTurn) {
        continue;
      }
      items.push({ ...item, taskIndex });
    }
    const live = stream.live;
    if (live && live.text.trim()) {
      const liveItem: TimelineItem = {
        kind: live.kind,
        id: 'stream:live',
        taskIndex,
        messageId: live.messageId,
        author: live.author,
        text: live.text.trim(),
      };
      if (!advance(liveItem)) {
        items.push(liveItem);
      }
    }
  }

  return { ...timeline, items };
}
