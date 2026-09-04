import { Flex, Text } from '@backstage/ui';
import { KarpenterMachinePool } from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { type KarpenterNodePoolStatus } from '../../../../hooks';
import { formatConsolidationPolicy, formatGoDuration } from '../karpenter';
import { ConfigRow } from './ConfigRow';

interface DisruptionAndLifecycleSectionProps {
  pool: KarpenterMachinePool;
  status: KarpenterNodePoolStatus | undefined;
}

export const DisruptionAndLifecycleSection = ({
  pool,
  status,
}: DisruptionAndLifecycleSectionProps) => {
  const policy = formatConsolidationPolicy(pool.getConsolidationPolicy());
  const consolidateAfter = formatGoDuration(pool.getConsolidateAfter());
  const expireAfter = formatGoDuration(pool.getExpireAfter());
  const gracePeriod = formatGoDuration(pool.getTerminationGracePeriod());
  const budgets = pool.getDisruptionBudgets();
  const taints = pool.getTaints();
  const startupTaints = pool.getStartupTaints();

  return (
    <InfoCard title="Disruption and lifecycle">
      <Flex direction="column" gap="4">
        <ConfigRow label="Consolidation">
          {policy === undefined ? (
            <Text variant="body-medium" color="secondary">
              Default (when empty or underutilized)
            </Text>
          ) : (
            <Text variant="body-medium">
              {policy}
              {consolidateAfter ? `, after ${consolidateAfter}` : ''}
            </Text>
          )}
        </ConfigRow>

        <ConfigRow label="Expire after">
          {expireAfter === undefined ? (
            <Text variant="body-medium" color="secondary">
              Never
            </Text>
          ) : (
            <Text variant="body-medium">{expireAfter}</Text>
          )}
        </ConfigRow>

        {gracePeriod !== undefined && (
          <ConfigRow label="Termination grace period">
            <Text variant="body-medium">{gracePeriod}</Text>
          </ConfigRow>
        )}

        {status?.allowedDisruptions !== undefined && (
          <ConfigRow label="Disruptable right now">
            <Text variant="body-medium">
              {`${status.allowedDisruptions} ${
                status.allowedDisruptions === 1 ? 'node' : 'nodes'
              }`}
            </Text>
          </ConfigRow>
        )}

        <ConfigRow label="Disruption budgets">
          {budgets.length === 0 ? (
            <Text variant="body-medium" color="secondary">
              Default (10% of nodes)
            </Text>
          ) : (
            <Flex direction="column" gap="0.5">
              {budgets.map((budget, index) => {
                const parts = [`${budget.nodes} nodes`];
                if (budget.schedule) {
                  parts.push(`during \`${budget.schedule}\``);
                }
                const duration = formatGoDuration(budget.duration);
                if (duration) {
                  parts.push(`for ${duration}`);
                }
                if (budget.reasons?.length) {
                  parts.push(`(${budget.reasons.join(', ')})`);
                }

                return (
                  <Text key={index} variant="body-medium">
                    {parts.join(' ')}
                  </Text>
                );
              })}
            </Flex>
          )}
        </ConfigRow>

        {taints.length > 0 && (
          <ConfigRow label="Taints">
            <Flex direction="column" gap="0.5">
              {taints.map((taint, index) => (
                <Text key={index} variant="body-medium">
                  {`${taint.key}${taint.value ? `=${taint.value}` : ''}:${taint.effect}`}
                </Text>
              ))}
            </Flex>
          </ConfigRow>
        )}

        {startupTaints.length > 0 && (
          <ConfigRow label="Startup taints">
            <Flex direction="column" gap="0.5">
              {startupTaints.map((taint, index) => (
                <Text key={index} variant="body-medium">
                  {`${taint.key}${taint.value ? `=${taint.value}` : ''}:${taint.effect}`}
                </Text>
              ))}
            </Flex>
          </ConfigRow>
        )}
      </Flex>
    </InfoCard>
  );
};
