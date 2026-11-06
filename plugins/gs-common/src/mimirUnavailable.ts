/**
 * Why the gs backend's Mimir proxy (`/mimir/query`, `/mimir/query_range`)
 * answers 503, in the body's `error.reason`. The backend sets it, the frontend
 * picks the words it shows from it. No reason: Mimir failed some other way.
 *
 * - `older_data_unavailable` -- Mimir has no healthy store-gateway, so it
 *   cannot read the blocks in long-term storage: a query that needs data older
 *   than what the ingesters still hold (roughly the last few hours) fails
 *   until a store-gateway is back, usually within minutes.
 */
export const MIMIR_UNAVAILABLE_REASONS = ['older_data_unavailable'] as const;

export type MimirUnavailableReason = (typeof MIMIR_UNAVAILABLE_REASONS)[number];

export function isMimirUnavailableReason(
  value: unknown,
): value is MimirUnavailableReason {
  return MIMIR_UNAVAILABLE_REASONS.includes(value as MimirUnavailableReason);
}
