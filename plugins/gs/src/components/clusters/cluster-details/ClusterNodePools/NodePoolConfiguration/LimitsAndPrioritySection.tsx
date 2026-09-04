import { Flex, Text } from '@backstage/ui';
import { KarpenterMachinePool } from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { NotAvailable } from '../../../../UI';
import { type KarpenterNodePoolStatus } from '../../../../hooks';
import { formatLimits } from '../karpenter';
import { ConfigRow } from './ConfigRow';
import { formatResourceName, formatResourceQuantity } from './resourceFormat';
import { UsageBar } from './UsageBar';

interface LimitsAndPrioritySectionProps {
  pool: KarpenterMachinePool;
  status: KarpenterNodePoolStatus | undefined;
}

export const LimitsAndPrioritySection = ({
  pool,
  status,
}: LimitsAndPrioritySectionProps) => {
  const configuredLimits = formatLimits(pool.getLimits());
  const weight = pool.getWeight();

  // Prefer the metrics for limits: they are numbers in the resource's base
  // unit, so they can be compared against usage. The CR's own values are
  // quantity strings and are used when metrics are unavailable.
  const metricLimits = status?.limits ?? {};
  const metricResources = Object.keys(metricLimits).sort((a, b) =>
    a.localeCompare(b),
  );

  return (
    <InfoCard title="Limits and priority">
      <Flex direction="column" gap="4">
        {metricResources.length > 0 ? (
          <ConfigRow label="Provisioning limits">
            <Flex direction="column" gap="3">
              {metricResources.map(resource => {
                const total = metricLimits[resource];
                const used = status?.usage?.[resource];

                return (
                  <UsageBar
                    key={resource}
                    used={used ?? 0}
                    total={total}
                    label={`${formatResourceName(resource)} ${
                      used === undefined
                        ? `— / ${formatResourceQuantity(resource, total)}`
                        : `${formatResourceQuantity(resource, used)} / ${formatResourceQuantity(resource, total)}`
                    }`}
                  />
                );
              })}
            </Flex>
          </ConfigRow>
        ) : (
          <ConfigRow label="Provisioning limits">
            {configuredLimits.length > 0 ? (
              <Flex direction="column" gap="0.5">
                {configuredLimits.map(limit => (
                  <Text key={limit.resource} variant="body-medium">
                    {`${formatResourceName(limit.resource)} ${limit.value}`}
                  </Text>
                ))}
              </Flex>
            ) : (
              <Text variant="body-medium" color="secondary">
                Unlimited
              </Text>
            )}
          </ConfigRow>
        )}

        {status?.totalNodes !== undefined && (
          <ConfigRow label="Nodes">
            <Text variant="body-medium">{status.totalNodes}</Text>
          </ConfigRow>
        )}

        <ConfigRow label="Weight">
          {weight === undefined ? (
            <Text variant="body-medium" color="secondary">
              Unset (treated as 0)
            </Text>
          ) : (
            <Text variant="body-medium">{weight}</Text>
          )}
        </ConfigRow>

        {pool.getProviderIDs().length > 0 && (
          <ConfigRow label="Provisioned instances">
            <Text variant="body-medium">{pool.getProviderIDs().length}</Text>
          </ConfigRow>
        )}

        <ConfigRow label="Ready">
          {pool.getStatusConditions() === undefined && !pool.isReady() ? (
            <NotAvailable />
          ) : (
            <Text variant="body-medium">{pool.isReady() ? 'Yes' : 'No'}</Text>
          )}
        </ConfigRow>
      </Flex>
    </InfoCard>
  );
};
