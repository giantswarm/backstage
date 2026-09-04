import { Flex, Grid, Text } from '@backstage/ui';
import {
  AzureMachineTemplate,
  MachineDeployment,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { NotAvailable } from '../../../../UI';
import { ConfigRow } from '../NodePoolConfiguration/ConfigRow';

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
  const vmSize = azureMachineTemplate?.getVmSize();

  return (
    <Grid.Root columns={{ xs: '1', md: '2' }} gap="4">
      <Grid.Item>
        <InfoCard title="Capacity and instance shape">
          <Flex direction="column" gap="4">
            <ConfigRow label="VM size">
              {vmSize ? (
                <Text variant="body-medium">{vmSize}</Text>
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
            <ConfigRow label="Nodes desired">
              {machineDeployment.getDesiredReplicas() !== undefined ? (
                <Text variant="body-medium">
                  {machineDeployment.getDesiredReplicas()}
                </Text>
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>

            <ConfigRow label="Nodes ready">
              {machineDeployment.getReadyReplicas() !== undefined ? (
                <Text variant="body-medium">
                  {machineDeployment.getReadyReplicas()}
                </Text>
              ) : (
                <NotAvailable />
              )}
            </ConfigRow>

            <ConfigRow label="Phase">
              {machineDeployment.getPhase() ? (
                <Text variant="body-medium">
                  {machineDeployment.getPhase()}
                </Text>
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
