/**
 * Sentry fingerprints on the message, so a log line that carries a plugin id,
 * an entity ref or a URL in its *message* turns a single fault into one issue
 * per value. Our own code keeps those values in structured metadata instead
 * (see the logging conventions in CLAUDE.md), but upstream Backstage log lines
 * we cannot change do not, so we collapse them here on the way out.
 */

export type SentryEvent = {
  message?: string | { message?: string; formatted?: string };
  exception?: { values?: Array<{ value?: string }> };
  fingerprint?: string[];
  extra?: Record<string, unknown>;
};

/**
 * Rewrites for known upstream messages, applied to the start of the message.
 * The value that fans the issue out is dropped; it stays available in the
 * event's extra data.
 */
const MESSAGE_REWRITES: Array<[RegExp, string]> = [
  // @backstage/backend-defaults DatabaseManager: one issue per plugin id, for
  // what is always a single database outage.
  [
    /^Database keepalive failed for plugin [^,]+,/,
    'Database keepalive failed,',
  ],
  // @backstage/plugin-catalog-backend DefaultCatalogProcessingEngine: one
  // issue per catalog entity.
  [/^Processing of \S+ failed/, 'Processing of an entity failed'],
];

/**
 * Tokens that differ per occurrence but not per fault. Order matters: URLs are
 * replaced first so that addresses and hashes inside them are not matched on
 * their own.
 */
const PLACEHOLDERS: Array<[RegExp, string]> = [
  [/https?:\/\/[^\s,)]+/g, '<url>'],
  [/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<address>'],
  [/\b[0-9a-f]{12,}\b/g, '<hash>'],
];

function normalizeMessage(message: string): string {
  let result = message;
  for (const [pattern, replacement] of MESSAGE_REWRITES) {
    result = result.replace(pattern, replacement);
  }
  for (const [pattern, replacement] of PLACEHOLDERS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function readEventMessage(event: SentryEvent): string | undefined {
  if (typeof event.message === 'string') {
    return event.message;
  }
  if (event.message) {
    return event.message.formatted ?? event.message.message;
  }
  return event.exception?.values?.[0]?.value;
}

function writeEventMessage(event: SentryEvent, message: string): void {
  if (typeof event.message === 'string') {
    event.message = message;
    return;
  }
  if (event.message) {
    if (event.message.formatted !== undefined) {
      event.message.formatted = message;
    }
    if (event.message.message !== undefined) {
      event.message.message = message;
    }
    return;
  }
  const exception = event.exception?.values?.[0];
  if (exception) {
    exception.value = message;
  }
}

/**
 * Collapses high-cardinality Sentry messages onto a stable fingerprint.
 *
 * Events whose message needs no rewriting are returned untouched, so their
 * grouping keeps working exactly as before.
 */
export function normalizeSentryEvent<T extends SentryEvent>(event: T): T {
  const original = readEventMessage(event);
  if (!original) {
    return event;
  }

  const normalized = normalizeMessage(original);
  if (normalized === original) {
    return event;
  }

  writeEventMessage(event, normalized);
  event.fingerprint = [normalized];
  event.extra = { ...event.extra, original_message: original };
  return event;
}
