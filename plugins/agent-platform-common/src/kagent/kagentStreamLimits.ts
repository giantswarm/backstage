/**
 * Upper bound on how long a turn is followed over streams, in all.
 *
 * Not a turn timeout: cutting the stream does not stop the turn, and the page
 * follows it through the conversation poll from then on. It exists so an agent
 * that never writes a terminal state cannot pin a socket (and its upstream
 * connection) open for as long as a tab stays on the page. Generous on
 * purpose: a legitimate turn with many tool calls runs many minutes, and every
 * gateway we know of gives up long before this does.
 *
 * Two sides hold it, which is why it lives here: the backend ends each relay
 * at it, and the page stops resubscribing to a turn once it has been followed
 * this long, so a chain of resubscriptions cannot get around it.
 */
export const STREAM_MAX_DURATION_MS = 30 * 60_000;
