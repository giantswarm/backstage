import { asRecord, isRecord } from './record';

const A2A_PREFIX = 'kagent.dev/a2a/';

/** Legacy unprefixed key to its `kagent.dev/a2a/` name. */
const CANONICAL_KEYS: Readonly<Record<string, string>> = {
  type: `${A2A_PREFIX}part-type`,
  usage_metadata: `${A2A_PREFIX}usage`,
};

const TIMELINE_POSITION_KEYS = [
  `${A2A_PREFIX}timeline-position`,
  'kagent.dev/timeline-position',
];

/**
 * Read a value from an A2A message's or part's `metadata` bag.
 *
 * kagent's public metadata contract (`docs/architecture/a2a-metadata.md` in
 * kagent) names its keys `kagent.dev/a2a/<name>`, whichever runtime produced
 * the message. Task history stored by older controllers carries the runtime's
 * own spelling instead, under a **prefixed** key: upstream Google ADK writes
 * `adk_<key>`, kagent's own code writes `kagent_<key>`, and one session can
 * contain every spelling. A reader therefore takes the canonical key first,
 * then `adk_`, then `kagent_`. A key holding `null`, nothing, or a value
 * `accept` rejects is skipped, so the next spelling still gets its turn.
 *
 * Callers ask for the legacy, unprefixed key (`type`, `usage_metadata`); the
 * canonical name for it comes from {@link CANONICAL_KEYS}.
 *
 * **`thought`, `author` and `partial` have no canonical name.** kagent 1.1
 * deletes every `adk_*` key at the runtime boundary and no longer stamps
 * `thought` on text parts, so on 1.1 these read as undefined: reasoning renders
 * as the agent's answer and replies carry no author. Stored task history from
 * older controllers still has them. A streamed chunk falls back to the A2A
 * `lastChunk` flag for `partial`.
 *
 * **Both legacy prefixes really do occur, on the same installation.** Two
 * sessions on one internal installation, read a day apart, carried
 * `kagent_usage_metadata` and `adk_usage_metadata` respectively. Reading only
 * one spelling makes a session's token totals silently zero.
 */
export function readKagentMetadata<T = unknown>(
  metadata: unknown,
  key: string,
  accept: (value: unknown) => value is T = isPresent as (
    value: unknown,
  ) => value is T,
): T | undefined {
  const bag = asRecord(metadata);
  if (!bag) {
    return undefined;
  }
  const canonical = CANONICAL_KEYS[key];
  const keys = canonical
    ? [canonical, `adk_${key}`, `kagent_${key}`]
    : [`adk_${key}`, `kagent_${key}`];
  for (const candidate of keys) {
    const value = bag[candidate];
    if (accept(value)) {
      return value;
    }
  }
  return undefined;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** `readKagentMetadata`, narrowed to a plain object. */
export function readKagentMetadataRecord(
  metadata: unknown,
  key: string,
): Record<string, unknown> | undefined {
  return readKagentMetadata(metadata, key, isRecord);
}

/** `readKagentMetadata`, narrowed to a non-empty string. */
export function readKagentMetadataString(
  metadata: unknown,
  key: string,
): string | undefined {
  return readKagentMetadata(metadata, key, isNonEmptyString);
}

/** `readKagentMetadata`, narrowed to a strict boolean `true`. */
export function isKagentMetadataFlagSet(metadata: unknown, key: string) {
  return readKagentMetadata(metadata, key, isBoolean) === true;
}

/**
 * The instant, in epoch milliseconds, of the RFC 3339 timeline position kagent
 * stamps on a history entry, under its canonical key or the one older
 * controllers wrote. A position that does not parse is skipped.
 */
export function readKagentTimelinePosition(
  metadata: unknown,
): number | undefined {
  const bag = asRecord(metadata);
  if (!bag) {
    return undefined;
  }
  for (const key of TIMELINE_POSITION_KEYS) {
    const value = bag[key];
    if (typeof value !== 'string' || value === '') {
      continue;
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

/**
 * The usage bag a delegated agent's tool response carries: a plain `usage`
 * object, or the metadata-style `*_usage_metadata` key of older runtimes. A
 * value `accept` rejects is skipped like in {@link readKagentMetadata}.
 */
export function readKagentSubagentUsage<T = Record<string, unknown>>(
  response: unknown,
  accept: (value: unknown) => value is T = isRecord as (
    value: unknown,
  ) => value is T,
): T | undefined {
  const bag = asRecord(response);
  if (!bag) {
    return undefined;
  }
  return accept(bag.usage)
    ? bag.usage
    : readKagentMetadata(bag, 'usage_metadata', accept);
}
