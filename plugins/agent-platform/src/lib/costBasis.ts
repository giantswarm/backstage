import type { TokenRateTier } from '../hooks/useTokenRates';
import { pricedTokenCount } from './costEstimate';
import { formatTokens } from './formatNumbers';

export type CostBasis = {
  tier: TokenRateTier;
  /** The model the session's agent runs on, when it could be resolved. */
  model: string | undefined;
  installation: string;
  /** The window the rate was averaged over, e.g. `7d`. */
  window: string;
  /** The input tokens the estimate priced, as the stats beside it count them. */
  inputTokens: number;
  /** The output tokens the estimate priced, as the stats beside it count them. */
  outputTokens: number;
  /**
   * Tokens kagent counted in its reported total but in neither part, which
   * the estimate therefore does not price: a model that reports thinking
   * separately (Gemini's `thoughtsTokenCount`) counts it there. Left out, or
   * zero, when there are none or the total is not known.
   */
  unpricedTokens?: number;
};

/**
 * The one line behind the session's estimated cost: what it was multiplied by,
 * or why there is nothing to show.
 *
 * Each branch names its tier, because they differ by up to a factor of two and
 * the figure alone cannot tell them apart. The `none` branches carry the
 * reason: an em dash with no explanation reads as a bug, and "the gateway has
 * never priced this model" is both actionable and not guessable.
 *
 * **`none` is only for a measurement that happened and yielded nothing.** The
 * `loading`, `unavailable` and `error` tiers exist so that its claim is never
 * made about an installation with no Mimir, or a query that failed — a cause
 * stated about a measurement that never ran is worse than no cause at all.
 *
 * Kept to a sentence. Earlier drafts explained *why* borrowing another model's
 * rate would be wrong, and closed with "Not a billed figure" — the first is
 * the code's job to know rather than the reader's to be told, and the second
 * is what the stat's own "Est." prefix already says.
 *
 * **It names the input and output counts `estimateCost` priced, formatted as
 * the stats beside it show them.** A single total in exact digits ("the 48,478
 * tokens beside it") named a figure no stat shows, so it read as the input
 * stat's own count (48.0k) badly rounded. Tokens the total holds beyond the
 * two parts, thinking for one, are not priced, and a second sentence says how
 * many rather than leaving them out of sight.
 */
export function describeCostBasis(basis: CostBasis): string {
  const { tier, model, installation, window } = basis;
  const applied = `applied to the ${formatTokens(
    pricedTokenCount(basis.inputTokens),
  )} input and ${formatTokens(
    pricedTokenCount(basis.outputTokens),
  )} output tokens`;
  const unpriced = pricedTokenCount(basis.unpricedTokens ?? 0);
  const leftOut =
    unpriced > 0
      ? ` kagent also counted ${formatTokens(
          unpriced,
        )} other tokens, such as thinking, which the estimate does not price.`
      : '';

  switch (tier) {
    case 'model':
      return `Estimated: ${model}'s observed cost per token on ${installation} over the last ${window}, ${applied}.${leftOut}`;

    case 'agent':
      return `Estimated: this agent's observed cost per token on ${installation} over the last ${window}, ${applied} — a blend across whatever models it ran, because its own model could not be resolved.${leftOut}`;

    case 'installation':
      return `Estimated: ${installation}'s observed cost per token over the last ${window}, ${applied} — a fleet-wide blend across every model.${leftOut}`;

    case 'loading':
      // Neither a figure nor a diagnosis: the queries have not landed.
      return 'Working out the rate from this environment\u2019s gateway metrics\u2026';

    case 'unavailable':
      // No metrics exist here at all, so "the gateway has not priced this
      // model" would describe a measurement that never happened.
      return `No estimate: ${installation} has no observability stack this portal can query, so there are no gateway metrics to derive a rate from.`;

    case 'error':
      return `No estimate: ${installation}\u2019s gateway metrics could not be read just now, so there is no rate to apply.`;

    case 'none':
    default:
      // Two different reasons, and the fix differs: point the agent at the LLM
      // gateway, versus wait for traffic or fix the price catalogue.
      return model
        ? `No estimate: the gateway has not priced a ${model} call on ${installation} in the last ${window}, so there is no rate to apply.`
        : `No estimate: nothing on ${installation} in the last ${window} could be priced. The token counts are unaffected.`;
  }
}
