import {
  Cluster,
  getClusterName,
  getClusterNamespace,
  getClusterOrganization,
} from '@giantswarm/backstage-plugin-gs-common';
import { useInstallations } from './useInstallations';
import { useMemo } from 'react';

export function useClusterDetailsTemplateData(
  installationName: string,
  cluster: Cluster,
) {
  const { installationsInfo } = useInstallations();

  const clusterName = getClusterName(cluster);
  const clusterNamespace = getClusterNamespace(cluster);
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
