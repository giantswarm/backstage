import { Flex, Text } from '@backstage/ui';
import {
  LoadingIndicator,
  Stat,
  StatGrid,
} from '@giantswarm/backstage-plugin-ui-react';

import {
  formatCount,
  formatMoney,
  formatTokens,
  useCurrency,
} from '../../../lib/formatNumbers';
import { CostPerDayCard } from '../../LlmUsage';
import { MODEL_USAGE_WINDOW_DAYS, type ModelUsage } from '../useModelUsage';

export type ModelUsageTabProps = {
  installation: string;
  /** The ModelConfig's `spec.model`: what the gateway's metrics are keyed by. */
  model: string | undefined;
  usage: ModelUsage;
};

/**
 * The model page's Usage tab: the gateway's figures for the model over the
 * last 30 days — spend, tokens and calls, and the spend per day — or why
 * there are none.
 */
export function ModelUsageTab({
  installation,
  model,
  usage: { slice, state },
}: ModelUsageTabProps) {
  const currency = useCurrency(installation);

  if (!model) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        No model ID set, so its usage cannot be matched to the gateway's
        figures.
      </Text>
    );
  }
  if (state === 'loading') {
    return <LoadingIndicator label="Reading this model's usage…" />;
  }
  if (state === 'unavailable') {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        Cost and token figures need the gateway's metrics, which {installation}{' '}
        does not publish to a store this portal can read.
      </Text>
    );
  }
  if (state === 'error' || !slice) {
    return (
      <Text as="p" variant="body-medium" color="secondary">
        Cost and token figures could not be read right now.
      </Text>
    );
  }

  const sub = `every user's, last ${MODEL_USAGE_WINDOW_DAYS} days`;
  return (
    <Flex direction="column" gap="4">
      <StatGrid>
        <Stat
          variant="tile"
          label="Spend"
          hint="Shows the gateway's price for calls to this model. A model missing from its catalogue shows —."
          // No calls is zero spend; calls without a price are "—".
          value={formatMoney(slice.calls === 0 ? 0 : slice.costUsd, currency)}
          sub={sub}
        />
        <Stat
          variant="tile"
          label="Tokens"
          hint="Counts the tokens that calls to this model used, as the gateway counted them."
          value={formatTokens(slice.tokens)}
          sub={sub}
        />
        <Stat
          variant="tile"
          label="Model calls"
          hint="Counts how often agents called this model through the gateway."
          value={formatCount(slice.calls)}
          sub={sub}
        />
      </StatGrid>
      {slice.costPerDay.series.length > 0 && (
        // One model, the page's own: the key would only repeat its name.
        <CostPerDayCard
          daily={slice.costPerDay}
          currency={currency}
          showLegend={false}
        />
      )}
      <Text as="p" variant="body-small" color="secondary">
        {slice.calls === 0
          ? `No calls to ${model} went through the gateway in the last ${MODEL_USAGE_WINDOW_DAYS} days.`
          : `This counts every gateway call to ${model} from any agent, including those through other configurations of this model on ${installation}.`}
      </Text>
    </Flex>
  );
}
