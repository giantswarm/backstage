/**
 * Read a value from an A2A message's or part's `metadata` bag.
 *
 * kagent stores everything interesting about a message — token usage, whether a
 * data part is a tool call or its response, whether a text part is the model's
 * reasoning — in `metadata`, under a **prefixed** key. Two prefixes are in play:
 * upstream Google ADK writes `adk_<key>`, kagent's own code writes
 * `kagent_<key>`, and a session can contain both depending on which version
 * produced each message.
 *
 * kagent's own UI resolves this exactly this way (`getMetadataValue` in
 * `ui/src/lib/messageHandlers.ts`), so following it is not a guess — it is the
 * interop mechanism kagent itself relies on. Prefer `adk_`, fall back to
 * `kagent_`.
 *
 * **Both prefixes really do occur, on the same installation.** Two gazelle
 * sessions read a day apart carried `kagent_usage_metadata` and
 * `adk_usage_metadata` respectively. This is therefore load-bearing rather than
 * defensive: reading only one prefix makes a session's token totals silently zero.
 *
 * This is deliberately the *only* place either prefix is spelled out. Everything
 * else asks for an unprefixed key.
 */
export function readKagentMetadata<T = unknown>(
  metadata: unknown,
  key: string,
): T | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  const bag = metadata as Record<string, unknown>;
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
