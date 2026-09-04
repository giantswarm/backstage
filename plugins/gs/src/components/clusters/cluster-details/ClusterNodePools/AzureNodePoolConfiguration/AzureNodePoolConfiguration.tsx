import { Grid } from '@backstage/ui';
import {
  AzureMachineTemplate,
  MachineDeployment,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { type Fact, FactList } from '../NodePoolConfiguration/FactList';

interface AzureNodePoolConfigurationProps {
  machineDeployment: MachineDeployment;
  azureMachineTemplate: AzureMachineTemplate | undefined;
}

/**
 * Configuration for an Azure node pool. The AzureMachineTemplate carries far
 * less than a Karpenter NodePool, so this is intentionally brief.
 */
export const AzureNodePoolConfiguration = ({
  machineDeployment,
  azureMachineTemplate,
}: AzureNodePoolConfigurationProps) => {
  const shape: Fact[] = [
    { label: 'VM size', value: azureMachineTemplate?.getVmSize() ?? '—' },
  ];

  const scaling: Fact[] = [
    {
      label: 'Nodes desired',
      value: machineDeployment.getDesiredReplicas()?.toString() ?? '—',
    },
    {
      label: 'Nodes ready',
      value: machineDeployment.getReadyReplicas()?.toString() ?? '—',
    },
    { label: 'Phase', value: machineDeployment.getPhase() ?? '—' },
  ];

  return (
    <Grid.Root columns={{ xs: '1', md: '2' }} gap="4">
      <Grid.Item>
        <InfoCard title="Instance shape">
          <FactList facts={shape} />
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
