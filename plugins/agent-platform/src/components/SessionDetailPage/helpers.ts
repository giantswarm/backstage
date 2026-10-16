import { readNestedTokenUsage } from '@giantswarm/backstage-plugin-agent-platform-common';
import { TimelineItem } from '../../lib/kagentTimeline';
import type { ComposerImage } from '../../lib/messageImages';

/**
 * The state badge's word for a turn the poll still reads as working but that
 * has stopped reporting progress: what the stalled row and the composer say.
 */
export const STALLED_STATE_LABEL = 'Not responding';

/**
 * The way out of a session that cannot go on when this portal cannot start the
 * new session: agent-manager refuses to start one as the person
 * (`AgentRow.sessionBlocker`), which the sentence passes on.
 */
export function newSessionBlockedText(agent: string, blocker: string): string {
  return `A new session with ${agent} cannot be started from this portal: sessions start through agent-manager as you. ${blocker}`;
}

/**
 * The way out of a session that cannot go on when this page has no new-session
 * button to offer (no addressable agent, or one still being read).
 */
export function newSessionElsewhereText(agent: string): string {
  return `Continue in a new session with ${agent} from the Sessions list.`;
}

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

/**
 * The last message the person sent, with the images it carried as the
 * composer holds them: what goes back into the box after a stalled turn is
 * stopped, and into a new session after a lost runtime. Images with no
 * preview (a type the transcript does not show) cannot be sent again, and are
 * left out.
 */
export function readLastUserMessage(
  items: readonly TimelineItem[],
): { text: string; images: ComposerImage[] } | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (item.kind !== 'user-message') {
      continue;
    }
    const images: ComposerImage[] = [];
    for (const other of items) {
      if (
        other.kind === 'attachment' &&
        other.isUser &&
        item.messageId !== undefined &&
        other.messageId === item.messageId &&
        other.preview.kind === 'image'
      ) {
        images.push({
          id: `sent:${other.id}`,
          name: other.name ?? 'Image',
          mediaType: other.preview.type,
          byteSize: other.preview.byteSize,
          previewUrl: other.preview.dataUrl,
        });
      }
    }
    return { text: item.text, images };
  }
  return undefined;
}
