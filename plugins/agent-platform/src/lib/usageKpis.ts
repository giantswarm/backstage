import type { SessionUsageTotals } from '@giantswarm/backstage-plugin-agent-platform-common';
import { estimateCost, type TokenRates } from './costEstimate';

/**
 * The arithmetic behind the Usage screen's KPI tiles, kept out of the
 * components so the tiles render what one tested function computed.
 *
 * Two kinds of cost meet here and must never be silently merged:
 *
 * - **Estimated**: token counts priced at an observed $/token rate
 *   (`estimateCost`). An estimate, labeled as one everywhere it renders.
 * - **Reported**: what a runtime said its own work cost (`reportedCostUsd`
 *   from the kagent fan-out — the claude harness reports it, ADK does not).
 *
 * `undefined` consistently means "not knowable", never zero.
 */

/**
 * The change of this window's spend against the previous window, as a
 * percentage. `undefined` unless both figures exist and the previous window
 * actually had spend — a delta against zero is not a percentage, and a delta
 * against an unpriced window is a claim about a measurement that never ran.
 */
export function spendChangePct(
  costUsd: number | undefined,
  previousCostUsd: number | undefined,
): number | undefined {
  if (
    costUsd === undefined ||
    previousCostUsd === undefined ||
    !Number.isFinite(costUsd) ||
    !Number.isFinite(previousCostUsd) ||
    previousCostUsd <= 0
  ) {
    return undefined;
  }
  return ((costUsd - previousCostUsd) / previousCostUsd) * 100;
}

/** The average cost of one session, or `undefined` without sessions or cost. */
export function perSessionUsd(
  costUsd: number | undefined,
  sessions: number,
): number | undefined {
  if (costUsd === undefined || !Number.isFinite(costUsd) || sessions <= 0) {
    return undefined;
  }
  return costUsd / sessions;
}

export type SessionSpend = {
  /** Token counts priced at the observed rate. Always an estimate. */
  estimatedUsd: number | undefined;
  /** What the runtimes reported, summed. Absent when none reported one. */
  reportedUsd: number | undefined;
};

/**
 * Both cost figures for a set of session totals: the estimate derived from its
 * token counts, and the runtime-reported sum where one exists. The two are
 * deliberately **not** combined into one number — they measure the same work
 * two different ways, and the prototype shows them side by side ("Est. cost"
 * and "Reported cost") for exactly that reason.
 */
export function sessionSpend(
  totals: Pick<
    SessionUsageTotals,
    'inputTokens' | 'outputTokens' | 'reportedCostUsd'
  >,
  rates: TokenRates | undefined,
): SessionSpend {
  return {
    estimatedUsd: estimateCost(totals.inputTokens, totals.outputTokens, rates),
    reportedUsd: totals.reportedCostUsd,
  };
}
