import { Flex, Grid, Text } from '@backstage/ui';
import {
  AWSMachinePool,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { NotAvailable } from '../../../../UI';
import {
  getInstanceTypeArchitectures,
  useAwsInstanceTypes,
} from '../awsInstanceTypeInfo';
import { ConfigRow } from '../NodePoolConfiguration/ConfigRow';
import { ValueBadges } from '../NodePoolConfiguration/ValueBadges';

interface ASGNodePoolConfigurationProps {
  machinePool: MachinePool;
  awsMachinePool: AWSMachinePool | undefined;
}

/**
 * Configuration for a classic autoscaling-group node pool. Thinner than the
 * Karpenter tab by nature: an ASG pool has a fixed shape rather than a set of
 * constraints.
 */
export const ASGNodePoolConfiguration = ({
  machinePool,
  awsMachinePool,
}: ASGNodePoolConfigurationProps) => {
  const instanceTypeData = useAwsInstanceTypes();

  const instanceType = awsMachinePool?.getInstanceType();
  const zones = awsMachinePool?.getAvailabilityZones();
  const minSize = awsMachinePool?.getMinSize();
  const maxSize = awsMachinePool?.getMaxSize();
  const architectures = instanceType
    ? getInstanceTypeArchitectures(instanceType, instanceTypeData)
    : undefined;

  return (
    <Grid.Root columns={{ xs: '1', md: '2' }} gap="4">
      <Grid.Item>
        <InfoCard title="Capacity and instance shape">
          <Flex direction="column" gap="4">
            <ConfigRow label="Instance type">
              {instanceType ? (
                <Text variant="body-medium">{instanceType}</Text>
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>

            <ConfigRow label="Architecture">
              {architectures ? (
                <Text variant="body-medium">{architectures.join(', ')}</Text>
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>

            <ConfigRow label="Availability zones">
              {zones?.length ? (
                <ValueBadges values={zones} />
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>
          </Flex>
        </InfoCard>
      </Grid.Item>

      <Grid.Item>
        <InfoCard title="Scaling">
          <Flex direction="column" gap="4">
            <ConfigRow label="Size range">
              {minSize !== undefined && maxSize !== undefined ? (
                <Text variant="body-medium">{`${minSize} – ${maxSize}`}</Text>
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>

            <ConfigRow label="Nodes desired">
              {machinePool.getDesiredReplicas() !== undefined ? (
                <Text variant="body-medium">
                  {machinePool.getDesiredReplicas()}
                </Text>
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>

            <ConfigRow label="Nodes ready">
              {machinePool.getReadyReplicas() !== undefined ? (
                <Text variant="body-medium">
                  {machinePool.getReadyReplicas()}
                </Text>
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>

            <ConfigRow label="Phase">
              {machinePool.getPhase() ? (
                <Text variant="body-medium">{machinePool.getPhase()}</Text>
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>
          </Flex>
        </InfoCard>
      </Grid.Item>
    </Grid.Root>
  );
};
