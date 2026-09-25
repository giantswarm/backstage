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
 * then `adk_`, then `kagent_`.
 *
 * Callers ask for the legacy, unprefixed key (`type`, `usage_metadata`); the
 * canonical name for it comes from {@link CANONICAL_KEYS}. A key with no
 * canonical counterpart (`thought`, `author`) is read under the prefixes only.
 *
 * **Both legacy prefixes really do occur, on the same installation.** Two
 * sessions on one internal installation, read a day apart, carried
 * `kagent_usage_metadata` and `adk_usage_metadata` respectively. Reading only
 * one spelling makes a session's token totals silently zero.
 *
 * This is deliberately the *only* place any of these spellings is written out.
 */
export function readKagentMetadata<T = unknown>(
  metadata: unknown,
  key: string,
): T | undefined {
  const bag = asBag(metadata);
  if (!bag) {
    return undefined;
  }
  const canonical = CANONICAL_KEYS[key];
  if (canonical && canonical in bag) {
    return bag[canonical] as T;
  }
  const adkKey = `adk_${key}`;
  if (adkKey in bag) {
    return bag[adkKey] as T;
  }
  const kagentKey = `kagent_${key}`;
  if (kagentKey in bag) {
    return bag[kagentKey] as T;
  }
  return undefined;
}

/** `readKagentMetadata`, narrowed to a non-empty string. */
export function readKagentMetadataString(
  metadata: unknown,
  key: string,
): string | undefined {
  const value = readKagentMetadata(metadata, key);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** `readKagentMetadata`, narrowed to a strict boolean `true`. */
export function isKagentMetadataFlagSet(metadata: unknown, key: string) {
  return readKagentMetadata(metadata, key) === true;
}

/**
 * The RFC 3339 timeline position kagent stamps on a history entry, under its
 * canonical key or the one older controllers wrote.
 */
export function readKagentTimelinePosition(
  metadata: unknown,
): string | undefined {
  const bag = asBag(metadata);
  if (!bag) {
    return undefined;
  }
  for (const key of TIMELINE_POSITION_KEYS) {
    const value = bag[key];
    if (typeof value === 'string' && value !== '') {
      return value;
    }
  }
  return undefined;
}

/**
 * The usage bag a delegated agent's tool response carries: a plain `usage`
 * field, or the metadata-style `*_usage_metadata` key of older runtimes.
 */
export function readKagentSubagentUsage(response: unknown): unknown {
  const bag = asBag(response);
  if (!bag) {
    return undefined;
  }
  if ('usage' in bag) {
    return bag.usage;
  }
  return readKagentMetadata(bag, 'usage_metadata');
}

function asBag(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}
