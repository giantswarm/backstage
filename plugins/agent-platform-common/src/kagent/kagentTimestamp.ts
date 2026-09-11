/**
 * Earliest plausible timestamp. Anything older is a zero value in some
 * encoding, not real data.
 */
const EARLIEST_PLAUSIBLE_YEAR = 1971;

/**
 * kagent serializes `created_at`/`updated_at` as non-pointer `time.Time`, so an
 * unset value arrives as Go zero time (`0001-01-01T00:00:00Z`) — which browsers
 * cheerfully render as "Dec 31, 0000". Reject that, anything unparseable, and
 * anything implausibly old, so callers can render a dash instead.
 *
 * The proto3 JSON of a `google.protobuf.Timestamp` is RFC 3339 too, so the
 * AgentInstance and A2A v1 shapes go through the same check.
 */
export function normalizeTimestamp(
  value: string | undefined,
): string | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  if (new Date(parsed).getUTCFullYear() < EARLIEST_PLAUSIBLE_YEAR) {
    return undefined;
  }
  return value;
}
