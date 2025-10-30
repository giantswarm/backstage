import { useInstallationsInfo } from './useInstallationsInfo';
import {
  getGrafanaDashboardFromEntity,
  getIngressHostFromEntity,
} from '../utils/entity';
import { useCatalogEntityForDeployment } from './useCatalogEntityForDeployment';
import {
  App,
  HelmRelease,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { findTargetClusterName } from '../deployments/utils/findTargetCluster';

export function useDeploymentDetailsTemplateData(
  installationName: string,
  deployment: App | HelmRelease,
) {
  const { installationsInfo } = useInstallationsInfo();
  const { catalogEntity } = useCatalogEntityForDeployment(deployment);

  const installationInfo = installationsInfo.find(
    info => info.name === installationName,
  );
  const baseDomain = installationInfo?.baseDomain ?? '';

  const appName = deployment.getName();
  const appNamespace = deployment.getNamespace();
  const appClusterName = findTargetClusterName(deployment);

  const grafanaDashboard = catalogEntity
    ? getGrafanaDashboardFromEntity(catalogEntity)
    : undefined;
  const ingressHost = catalogEntity
    ? getIngressHostFromEntity(catalogEntity)
    : undefined;

  return {
    APP_NAME: appName,
    APP_NAMESPACE: appNamespace,
    APP_CLUSTER_NAME: appClusterName,
    INGRESS_HOST: ingressHost,
    GRAFANA_DASHBOARD: grafanaDashboard,
    MC_NAME: installationName,
    BASE_DOMAIN: baseDomain,
  };
}
