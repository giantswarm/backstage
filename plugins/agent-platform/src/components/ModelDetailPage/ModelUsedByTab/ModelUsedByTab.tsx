import { useMemo } from 'react';
import { Text } from '@backstage/ui';

import { formatMoney, useCurrency } from '../../../lib/formatNumbers';
import type { AgentRow } from '../../AgentsDataProvider';
import { type AgentUsage, AgentUsageList } from '../../AgentUsageList';
import { MODEL_USAGE_WINDOW_DAYS, type ModelUsage } from '../useModelUsage';

export type ModelUsedByTabProps = {
  installation: string;
  /** The agents whose spec names this ModelConfig, in the order to list them. */
  using: AgentRow[];
  /** Whether the agents are still being read. */
  isLoading: boolean;
  /** Whether the agents on the model's installation could not be read. */
  isUnreachable: boolean;
  usage: ModelUsage;
};

/**
 * The model page's Used by tab: the agents that run on the model, as the
 * skill and connector pages list theirs (`AgentUsageList`), each linking to
 * its own page, with what it spent on the model at the row's end once the
 * gateway's figures are in.
 */
export function ModelUsedByTab({
  installation,
  using,
  isLoading,
  isUnreachable,
  usage: { slice },
}: ModelUsedByTabProps) {
  const currency = useCurrency(installation);
  const agents = useMemo<AgentUsage[]>(
    () =>
      using.map(row => {
        if (!slice) {
          return { row };
        }
        const spent = slice.byAgent.get(
          `${row.namespace}/${row.technicalName}`,
        );
        // No calls is zero spend; calls without a price are "—".
        return {
          row,
          detail: formatMoney(
            !spent || spent.calls === 0 ? 0 : spent.costUsd,
            currency,
          ),
        };
      }),
    [using, slice, currency],
  );

  return (
    <AgentUsageList
      agents={agents}
      label="Agents using this model"
      emptyText={
        isUnreachable
          ? `The agents on ${installation} could not be read.`
          : 'No agent runs on this model yet.'
      }
      isLoading={isLoading && agents.length === 0}
    >
      {slice && agents.length > 0 && (
        <Text as="p" variant="body-small" color="secondary">
          Each agent shows its spend on this model over the last{' '}
          {MODEL_USAGE_WINDOW_DAYS} days.
        </Text>
      )}
    </AgentUsageList>
  );
}
