import { Flex, Grid } from '@backstage/ui';
import {
  AWSMachinePool,
  MachinePool,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import {
  getInstanceTypeArchitectures,
  useAwsInstanceTypes,
} from '../awsInstanceTypeInfo';
import { type Fact, FactList } from '../NodePoolConfiguration/FactList';
import { ChipRow } from '../NodePoolConfiguration/ChipRow';

interface ASGNodePoolConfigurationProps {
  machinePool: MachinePool;
  awsMachinePool: AWSMachinePool | undefined;
}

/**
 * Configuration for a classic autoscaling-group node pool. Thinner than the
 * Karpenter tab by nature: an ASG pool has a fixed shape rather than a set of
 * constraints, so there is no allowed-vs-running comparison to draw.
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

  const shape: Fact[] = [
    { label: 'Instance type', value: instanceType ?? '—' },
    { label: 'Architecture', value: architectures?.join(', ') ?? '—' },
    {
      label: 'Availability zones',
      value: zones?.length ? <ChipRow values={zones} /> : '—',
    },
  ];

  const scaling: Fact[] = [
    {
      label: 'Size range',
      value:
        minSize !== undefined && maxSize !== undefined
          ? `${minSize} – ${maxSize}`
          : '—',
    },
    {
      label: 'Nodes desired',
      value: machinePool.getDesiredReplicas()?.toString() ?? '—',
    },
    {
      label: 'Nodes ready',
      value: machinePool.getReadyReplicas()?.toString() ?? '—',
    },
    { label: 'Phase', value: machinePool.getPhase() ?? '—' },
  ];

  return (
    <Grid.Root
      columns={{ xs: '1', md: '2' }}
      gap="4"
      style={{ alignItems: 'start' }}
    >
      <Grid.Item>
        <InfoCard title="Instance shape">
          <Flex direction="column" gap="4">
            <FactList facts={shape} />
          </Flex>
        </InfoCard>
      </Grid.Item>
      <Grid.Item>
        <InfoCard title="Scaling">
          <FactList facts={scaling} />
        </InfoCard>
      </Grid.Item>
    </Grid.Root>
  );
};
