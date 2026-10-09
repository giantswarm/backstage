import { TimelineItem } from '../../lib/kagentTimeline';

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
  if (
    (polled.kind === 'tool-call' && streamed.kind === 'tool-call') ||
    (polled.kind === 'agent-call' && streamed.kind === 'agent-call')
  ) {
    return polled.isPending && !streamed.isPending
      ? { ...polled, result: streamed.result, isPending: false }
      : undefined;
  }
  if (
    (polled.kind === 'agent-message' && streamed.kind === 'agent-message') ||
    (polled.kind === 'reasoning' && streamed.kind === 'reasoning')
  ) {
    return streamed.text.length > polled.text.length
      ? { ...polled, text: streamed.text }
      : undefined;
  }
  return undefined;
}
