import type { ModelCostFallbackReason } from '../hooks/useModelCost';

/**
 * The one line that says why "Your sessions" shows an estimate rather than
 * the gateway's actual figure, or undefined when the estimate's own basis line
 * already says it.
 *
 * `no-mimir` and `error` stay silent on purpose: without Mimir, or with it
 * failing, the estimate has no rate either, and `describeCostBasis` already
 * names that — a second sentence would say the same thing twice.
 */
export function describeModelCostFallback(
  reason: ModelCostFallbackReason,
  installation: string,
  days: number,
): string | undefined {
  switch (reason) {
    case 'no-identity':
      return `No actual cost: kagent on ${installation} does not say who you are, so your own model calls cannot be picked out.`;
    case 'not-recorded':
      return `No actual cost: the gateway on ${installation} does not record who made each model call.`;
    case 'no-spend':
      return `No actual cost: the gateway priced none of your model calls on ${installation} in the last ${days} days.`;
    case 'unreadable':
      return `No actual cost: ${installation}’s gateway metrics could not be read just now.`;
    case 'no-mimir':
    case 'error':
    default:
      return undefined;
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
      'Some calls in this window were recorded before the gateway noted who made them, so the figure may be low.',
    );
  }
  if (converted) {
    parts.push('Converted from USD at this environment’s configured rate.');
  }
  return parts.join(' ');
}
