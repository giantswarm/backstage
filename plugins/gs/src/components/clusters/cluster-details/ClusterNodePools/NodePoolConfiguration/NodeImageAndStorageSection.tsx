import { Flex, Text } from '@backstage/ui';
import { KarpenterMachinePool } from '@giantswarm/backstage-plugin-kubernetes-react';
import { InfoCard } from '@giantswarm/backstage-plugin-ui-react';
import { NotAvailable } from '../../../../UI';
import { ConfigRow } from './ConfigRow';
import { ValueBadges } from './ValueBadges';

interface NodeImageAndStorageSectionProps {
  pool: KarpenterMachinePool;
}

export const NodeImageAndStorageSection = ({
  pool,
}: NodeImageAndStorageSectionProps) => {
  const amiFamily = pool.getAmiFamily();
  const aliases = pool.getAmiAliases();
  const rootVolume = pool.getRootVolume();
  const detailedMonitoring = pool.getDetailedMonitoring();
  const instanceStorePolicy = pool.getInstanceStorePolicy();
  const iamRole = pool.getIamRole() ?? pool.getInstanceProfile();
  const kubelet = pool.getKubeletConfig();

  const rootVolumeParts: string[] = [];
  if (rootVolume?.ebs?.volumeSize) {
    rootVolumeParts.push(rootVolume.ebs.volumeSize);
  }
  if (rootVolume?.ebs?.volumeType) {
    rootVolumeParts.push(rootVolume.ebs.volumeType);
  }
  if (rootVolume?.ebs?.encrypted) {
    rootVolumeParts.push('encrypted');
  }

  return (
    <InfoCard title="Node image and storage">
      <Flex direction="column" gap="4">
        <ConfigRow label="AMI family">
          {amiFamily === undefined ? (
            <NotAvailable />
          ) : (
            <Text variant="body-medium">{amiFamily}</Text>
          )}
        </ConfigRow>

        {aliases.length > 0 && (
          <ConfigRow label="AMI alias">
            <ValueBadges values={aliases} />
          </ConfigRow>
        )}

        <ConfigRow label="Root volume">
          {rootVolumeParts.length === 0 ? (
            <Text variant="body-medium" color="secondary">
              Defaults from the AMI
            </Text>
          ) : (
            <Text variant="body-medium">{rootVolumeParts.join(', ')}</Text>
          )}
        </ConfigRow>

        {instanceStorePolicy !== undefined && (
          <ConfigRow label="Instance store policy">
            <Text variant="body-medium">{instanceStorePolicy}</Text>
          </ConfigRow>
        )}

        {kubelet?.maxPods !== undefined && (
          <ConfigRow label="Max pods per node">
            <Text variant="body-medium">{kubelet.maxPods}</Text>
          </ConfigRow>
        )}

        <ConfigRow label="Detailed monitoring">
          <Text variant="body-medium">{detailedMonitoring ? 'On' : 'Off'}</Text>
        </ConfigRow>

        {iamRole !== undefined && (
          <ConfigRow label="IAM role">
            <Text variant="body-medium">{iamRole}</Text>
          </ConfigRow>
        )}
      </Flex>
    </InfoCard>
  );
};
