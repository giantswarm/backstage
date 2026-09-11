import type { TokenRateTier } from '../hooks/useTokenRates';
import { formatCount } from './formatNumbers';

export type CostBasis = {
  tier: TokenRateTier;
  /** The model the session's agent runs on, when it could be resolved. */
  model: string | undefined;
  installation: string;
  /** The window the rate was averaged over, e.g. `7d`. */
  window: string;
  /** The session's total tokens, which the rate is applied to. */
  tokens: number;
};

/**
 * The one line behind the session's estimated cost: what it was multiplied by,
 * or why there is nothing to show.
 *
 * Each branch names its tier, because the four differ by up to a factor of two
 * and the figure alone cannot tell them apart. The `none` branches carry the
 * reason: an em dash with no explanation reads as a bug, and "the gateway has
 * never priced this model" is both actionable and not guessable.
 *
 * Kept to a sentence. Earlier drafts explained *why* borrowing another model's
 * rate would be wrong, and closed with "Not a billed figure" — the first is
 * the code's job to know rather than the reader's to be told, and the second
 * is what the stat's own "Est." prefix already says.
 */
export function describeCostBasis(basis: CostBasis): string {
  const { tier, model, installation, window, tokens } = basis;
  const applied = `applied to the ${formatCount(tokens)} tokens above`;

  switch (tier) {
    case 'model':
      return `Estimated: ${model}'s observed cost per token on ${installation} over the last ${window}, ${applied}.`;

    case 'agent':
      return `Estimated: this agent's observed cost per token on ${installation} over the last ${window}, ${applied} — a blend across whatever models it ran, because its own model could not be resolved.`;

    case 'installation':
      return `Estimated: ${installation}'s observed cost per token over the last ${window}, ${applied} — a fleet-wide blend across every model.`;

    case 'none':
    default:
      // Two different reasons, and the fix differs: point the agent at the LLM
      // gateway, versus wait for traffic or fix the price catalogue.
      return model
        ? `No estimate: the gateway has not priced a ${model} call on ${installation} in the last ${window}, so there is no rate to apply.`
        : `No estimate: nothing on ${installation} in the last ${window} could be priced. The token counts are unaffected.`;
  }
}
