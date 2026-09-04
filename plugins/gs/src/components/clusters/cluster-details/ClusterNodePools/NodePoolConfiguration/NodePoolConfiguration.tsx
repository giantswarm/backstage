import { Grid, Text } from '@backstage/ui';
import { KarpenterMachinePool } from '@giantswarm/backstage-plugin-kubernetes-react';
import { type KarpenterNodePoolStatus } from '../../../../hooks';
import { CapacityAndShapeSection } from './CapacityAndShapeSection';
import { DisruptionAndLifecycleSection } from './DisruptionAndLifecycleSection';
import { LimitsAndPrioritySection } from './LimitsAndPrioritySection';
import { NodeImageAndStorageSection } from './NodeImageAndStorageSection';

interface NodePoolConfigurationProps {
  /** The pool's CR, or `undefined` when it could not be read. */
  pool: KarpenterMachinePool | undefined;
  nodePoolName: string;
  /**
   * The running mix. Passed in rather than fetched here, so this stays a pure
   * render of whatever data is available.
   */
  status: KarpenterNodePoolStatus | undefined;
}

export const NodePoolConfiguration = ({
  pool,
  nodePoolName,
  status,
}: NodePoolConfigurationProps) => {
  if (!pool) {
    return (
      <Text variant="body-medium" color="secondary">
        {`Karpenter configuration unavailable — the KarpenterMachinePool "${nodePoolName}" could not be read.`}
      </Text>
    );
  }

  const hasNodePoolSpec = pool.getNodePoolSpec() !== undefined;
  const hasNodeClassSpec = pool.getEC2NodeClassSpec() !== undefined;

  if (!hasNodePoolSpec && !hasNodeClassSpec) {
    return (
      <Text variant="body-medium" color="secondary">
        This node pool's Karpenter resource carries no configuration yet.
      </Text>
    );
  }

  return (
    <Grid.Root columns={{ xs: '1', md: '2' }} gap="4">
      {hasNodePoolSpec && (
        <>
          <Grid.Item>
            <CapacityAndShapeSection pool={pool} status={status} />
          </Grid.Item>
          <Grid.Item>
            <LimitsAndPrioritySection pool={pool} status={status} />
          </Grid.Item>
          <Grid.Item>
            <DisruptionAndLifecycleSection pool={pool} status={status} />
          </Grid.Item>
        </>
      )}
      {hasNodeClassSpec && (
        <Grid.Item>
          <NodeImageAndStorageSection pool={pool} />
        </Grid.Item>
      )}
    </Grid.Root>
  );
};
