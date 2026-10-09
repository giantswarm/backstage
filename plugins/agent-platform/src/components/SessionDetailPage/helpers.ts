import { readNestedTokenUsage } from '@giantswarm/backstage-plugin-agent-platform-common';
import { TimelineItem } from '../../lib/kagentTimeline';

/**
 * Pairs streamed items with the polled items they are copies of.
 *
 * Recognition is by `messageId`, and pairing by **position within the
 * message**: the nth item of a kind under one id in the stream is the nth item
 * of that kind under the same id in the poll. One message can hold several
 * items of a kind — text either side of a call, parallel calls — and both
 * sides split a message the same way, in the same order.
 *
 * Stateful: it counts what it has been asked, so streamed items are passed in
 * stream order, once each.
 */
export function createPolledPairing(polled: TimelineItem[]) {
  const keyOf = (kind: string, messageId: string) =>
    `${kind}\u0000${messageId}`;
  const copies = new Map<string, number[]>();
  polled.forEach((item, index) => {
    if (item.messageId) {
      const key = keyOf(item.kind, item.messageId);
      copies.set(key, [...(copies.get(key) ?? []), index]);
    }
  });
  const asked = new Map<string, number>();

  /** The index of the polled copy of a streamed item, when the poll has it yet. */
  return (item: { kind: string; messageId?: string }): number | undefined => {
    if (item.messageId === undefined) {
      return undefined;
    }
    const key = keyOf(item.kind, item.messageId);
    const ordinal = asked.get(key) ?? 0;
    asked.set(key, ordinal + 1);
    return copies.get(key)?.[ordinal];
  };
}

/**
 * The polled item updated with what its streamed copy knows beyond it — a
 * call's result, or more of a reply — or undefined when the polled copy is as
 * far along.
 *
 * A poll taken mid-turn can hold an item the stream has since moved on: a call
 * still running whose result has streamed in, or text cut off where the read
 * happened. Dropping the streamed copy by id there would show the stale one
 * until the next read. The polled item keeps its id and position; only the
 * content advances.
 */
export function fresherStreamedCopy(
  polled: TimelineItem,
  streamed: TimelineItem,
): TimelineItem | undefined {
  if (polled.kind !== streamed.kind) {
    return undefined;
  }
  if (
    (polled.kind === 'tool-call' || polled.kind === 'agent-call') &&
    (streamed.kind === 'tool-call' || streamed.kind === 'agent-call')
  ) {
    if (!polled.isPending || streamed.isPending) {
      return undefined;
    }
    const answered = {
      ...polled,
      result: streamed.result,
      isPending: false,
    };
    // As `buildTimeline` folds a delegation's response: the delegated agent's
    // usage is reported inside it.
    return answered.kind === 'agent-call'
      ? { ...answered, tokens: readNestedTokenUsage(streamed.result) }
      : answered;
  }
  if (
    (polled.kind === 'agent-message' || polled.kind === 'reasoning') &&
    (streamed.kind === 'agent-message' || streamed.kind === 'reasoning')
  ) {
    // A continuation of the polled text, not merely a longer one: anything else
    // is a different item, and must not take this one's place.
    return streamed.text.length > polled.text.length &&
      streamed.text.startsWith(polled.text)
      ? { ...polled, text: streamed.text }
      : undefined;
  }
  return undefined;
}
