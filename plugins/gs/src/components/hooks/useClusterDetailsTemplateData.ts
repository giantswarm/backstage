import { useInstallationsInfo } from './useInstallationsInfo';
import { useMemo } from 'react';
import { getClusterOrganization } from '../clusters/utils';
import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';

export function useClusterDetailsTemplateData(
  installationName: string,
  cluster: Cluster,
) {
  const { installationsInfo } = useInstallationsInfo();

  const clusterName = cluster.getName();
  const clusterNamespace = cluster.getNamespace();
  const organizationName = getClusterOrganization(cluster);

  const installationInfo = installationsInfo.find(
    info => info.name === installationName,
  );
  const baseDomain = installationInfo?.baseDomain ?? '';

  return useMemo(() => {
    return {
      CLUSTER_NAME: clusterName,
      CLUSTER_NAMESPACE: clusterNamespace,
      MC_NAME: installationName,
      ORG_NAME: organizationName ?? '',
      BASE_DOMAIN: baseDomain,
    };
  }, [
    baseDomain,
    clusterName,
    clusterNamespace,
    installationName,
    organizationName,
  ]);
}
