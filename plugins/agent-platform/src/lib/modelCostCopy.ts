import type { ModelCostFallbackReason } from '../hooks/useModelCost';

/**
 * The one line that says why "Your sessions" shows an estimate rather than
 * the gateway's actual figure, or undefined when the estimate's own basis line
 * already says it.
 *
 * Only `no-mimir` stays silent: without Mimir the estimate has no rate either,
 * and `describeCostBasis` already says the installation has no observability
 * stack — a second sentence would say the same thing twice. Every other
 * reason can sit beside a priced estimate (the rate comes from another route),
 * so it has to be said.
 */
export function describeModelCostFallback(
  reason: ModelCostFallbackReason,
  installation: string,
  days: number,
): string | undefined {
  switch (reason) {
    case 'identity-unreadable':
      return `No actual cost: kagent on ${installation} could not say who you are just now.`;
    case 'no-identity':
      return `No actual cost: kagent on ${installation} does not say who you are, so your own model calls cannot be picked out.`;
    case 'not-recorded':
      return `No actual cost: the gateway on ${installation} does not record who made each model call.`;
    case 'no-spend':
      return `No actual cost: the gateway priced none of your model calls on ${installation} in the last ${days} days.`;
    case 'unreadable':
      return `No actual cost: ${installation}’s gateway metrics could not be read just now.`;
    case 'no-mimir':
      return undefined;
    case 'error':
    default:
      return `No actual cost: it could not be read from ${installation} just now.`;
  }
}

/**
 * The hint on the actual cost: what it sums, and why it can be more than the
 * tokens beside it would suggest.
 */
export function describeActualCost({
  installation,
  days,
  partial,
  converted,
}: {
  installation: string;
  days: number;
  partial: boolean;
  converted: boolean;
}): string {
  const parts = [
    `Sums the gateway’s price for every model call made as you on ${installation} in the last ${days} days. That includes calls outside these sessions, so it can be more than the tokens beside it suggest. Models missing from its catalogue add nothing.`,
  ];
  if (partial) {
    parts.push(
      'Some calls in this window were recorded without saying who made them, so the figure may be low.',
    );
  }
  if (converted) {
    parts.push('Converted from USD at this environment’s configured rate.');
  }
  return parts.join(' ');
}

/**
 * The per-agent table's note on the actual cost: what each row sums, and the
 * same caveats the strip's hint carries.
 *
 * It does not compare the rows with the strip's total: with the window
 * narrowed the two cover different days, so "the rest is in the total" would
 * not hold.
 */
export function describeActualCostByAgent({
  days,
  partial,
  converted,
}: {
  days: number;
  partial: boolean;
  converted: boolean;
}): string {
  const parts = [
    `Cost is the gateway’s price for every model call each agent made as you in the last ${days} days, in these sessions or not, so it need not match the tokens beside it. A call from outside any agent’s pod, or through an agent with no session in the window, has no row.`,
  ];
  if (partial) {
    parts.push(
      'Some calls in this window were recorded without saying who made them, so these may be low.',
    );
  }
  if (converted) {
    parts.push('Converted from USD at this environment’s configured rate.');
  }
  return parts.join(' ');
}
