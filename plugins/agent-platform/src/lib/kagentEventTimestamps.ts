import { kagentEventWireSchema } from './kagentTaskSchema';
import { normalizeTimestamp } from './kagentSessions';

/**
 * Map `messageId` → RFC3339 timestamp, built from a session's stored events.
 *
 * **Why this exists:** A2A messages carry no timestamp of their own, so the
 * timeline built from `GET /api/sessions/:id/tasks` has no per-item time. The
 * stored events do (`Event.created_at`), and each event's payload is a serialized
 * A2A message carrying the same `messageId` — so the events are useful for
 * exactly one thing: recovering times.
 *
 * `Event.data` is **doubly encoded** — a JSON string holding the serialized
 * message (`go/api/database/models.go`: `Data string // JSON-serialized
 * protocol.Message`) — so each row needs a second `JSON.parse`. We read only
 * `messageId` from it; the content itself comes from the tasks, which are better
 * structured.
 *
 * Treat the result as **decoration**. Whether the two storage paths agree on
 * message ids is not guaranteed anywhere, so a miss must be survivable: callers
 * fall back to the task's own timestamp and then to rendering no time at all.
 * This function never throws and never rejects a whole list because of one bad
 * row.
 */
export function buildEventTimestampIndex(events: unknown): Map<string, string> {
  const index = new Map<string, string>();
  if (!Array.isArray(events)) {
    return index;
  }

  for (const row of events) {
    const parsed = kagentEventWireSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }

    // Reuse the sessions normalizer: it rejects Go zero time
    // (`0001-01-01T00:00:00Z`, which browsers render as "Dec 31, 0000") and
    // anything unparseable, so a bogus value yields no timestamp rather than a
    // nonsense one.
    const createdAt = normalizeTimestamp(parsed.data.created_at);
    if (!createdAt || !parsed.data.data) {
      continue;
    }

    const messageId = readMessageId(parsed.data.data);
    if (!messageId) {
      continue;
    }

    // First write wins: events are stored append-only, so the earliest row
    // mentioning a message is when it happened. A duplicate id later is a resend,
    // not a new event.
    if (!index.has(messageId)) {
      index.set(messageId, createdAt);
    }
  }

  return index;
}

/** Second decode: pull `messageId` out of the serialized message. */
function readMessageId(serialized: string): string | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(serialized);
  } catch {
    // A truncated or re-encoded payload costs one timestamp. Not worth a warning:
    // the timeline is complete either way.
    return undefined;
  }
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const messageId = (payload as { messageId?: unknown }).messageId;
  return typeof messageId === 'string' && messageId !== ''
    ? messageId
    : undefined;
}
