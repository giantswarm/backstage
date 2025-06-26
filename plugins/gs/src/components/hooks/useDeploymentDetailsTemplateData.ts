import {
  AppKind,
  Deployment,
  getAppTargetClusterName,
  getHelmReleaseTargetClusterName,
} from '@giantswarm/backstage-plugin-gs-common';
import { useInstallations } from './useInstallations';
import {
  getGrafanaDashboardFromEntity,
  getIngressHostFromEntity,
} from '../utils/entity';
import { useCatalogEntityForDeployment } from './useCatalogEntityForDeployment';

export function useDeploymentDetailsTemplateData(
  installationName: string,
  deployment: Deployment,
) {
  const { installationsInfo } = useInstallations();
  const { catalogEntity } = useCatalogEntityForDeployment(deployment);

  const installationInfo = installationsInfo.find(
    info => info.name === installationName,
  );
  const baseDomain = installationInfo?.baseDomain ?? '';

  const appName = deployment.metadata.name;
  const appNamespace = deployment.metadata.namespace;
  const appClusterName =
    deployment.kind === AppKind
      ? getAppTargetClusterName(deployment, installationName)
      : getHelmReleaseTargetClusterName(deployment, installationName);

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
