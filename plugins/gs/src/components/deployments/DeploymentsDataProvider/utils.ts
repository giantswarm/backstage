import {
  Deployment,
  getAppCatalogName,
  getAppChartName,
  getAppCurrentVersion,
  getAppStatus,
  getAppTargetClusterName,
  getAppTargetClusterNamespace,
  getAppUpdatedTimestamp,
  getAppVersion,
  getHelmReleaseChartName,
  getHelmReleaseLastAppliedRevision,
  getHelmReleaseLastAttemptedRevision,
  getHelmReleaseSourceKind,
  getHelmReleaseSourceName,
  getHelmReleaseStatus,
  getHelmReleaseTargetClusterName,
  getHelmReleaseTargetClusterNamespace,
  getHelmReleaseUpdatedTimestamp,
} from '@giantswarm/backstage-plugin-gs-common';
import { parseEntityRef } from '@backstage/catalog-model';
import { calculateClusterType, calculateDeploymentLabels } from '../utils';
import { formatAppCatalogName, formatVersion } from '../../utils/helpers';

export type DeploymentData = {
  installationName: string;
  kind: string;
  clusterName?: string;
  clusterNamespace?: string;
  clusterType?: string;
  name: string;
  namespace?: string;
  version: string;
  attemptedVersion: string;
  status?: string;
  updated?: string;
  sourceKind?: string;
  sourceName?: string;
  chartName?: string;
  apiVersion: string;
  labels?: string[];
  entityRef?: string;
  app?: string;
};

function getStatus(deploymentStatus: string) {
  const successfulStatuses = ['reconciled', 'deployed'];

  const pendingStatuses = [
    'reconciling',
    'pending-install',
    'pending-upgrade',
    'pending-rollback',
    'uninstalling',
  ];

  if (successfulStatuses.includes(deploymentStatus)) {
    return 'successful';
  }

  if (pendingStatuses.includes(deploymentStatus)) {
    return 'pending';
  }

  return 'failed';
}

export function collectDeploymentData({
  installationName,
  deployment,
  catalogEntitiesMap,
}: {
  installationName: string;
  deployment: Deployment;
  catalogEntitiesMap: { [deploymentName: string]: string };
}): DeploymentData {
  const chartName =
    deployment.kind === 'App'
      ? getAppChartName(deployment)
      : getHelmReleaseChartName(deployment);
  const entityRef = chartName ? catalogEntitiesMap[chartName] : undefined;
  const app = entityRef ? parseEntityRef(entityRef).name : undefined;

  const deploymentStatus =
    deployment.kind === 'App'
      ? getAppStatus(deployment)
      : getHelmReleaseStatus(deployment);

  const status = deploymentStatus ? getStatus(deploymentStatus) : undefined;

  return deployment.kind === 'App'
    ? {
        installationName,
        kind: 'app',
        clusterName: getAppTargetClusterName(deployment, installationName),
        clusterNamespace: getAppTargetClusterNamespace(
          deployment,
          installationName,
        ),
        clusterType: calculateClusterType(deployment, installationName),
        name: deployment.metadata.name,
        namespace: deployment.metadata.namespace,
        version: formatVersion(getAppCurrentVersion(deployment) ?? ''),
        attemptedVersion: formatVersion(getAppVersion(deployment) ?? ''),
        status,
        updated: getAppUpdatedTimestamp(deployment),
        sourceKind: 'AppCatalog',
        sourceName: formatAppCatalogName(getAppCatalogName(deployment) ?? ''),
        chartName,
        apiVersion: deployment.apiVersion,
        labels: calculateDeploymentLabels(deployment),
        entityRef,
        app,
      }
    : {
        installationName,
        kind: 'helmrelease',
        clusterName: getHelmReleaseTargetClusterName(
          deployment,
          installationName,
        ),
        clusterNamespace: getHelmReleaseTargetClusterNamespace(deployment),
        clusterType: calculateClusterType(deployment, installationName),
        name: deployment.metadata.name,
        namespace: deployment.metadata.namespace,
        version: formatVersion(
          getHelmReleaseLastAppliedRevision(deployment) ?? '',
        ),
        attemptedVersion: formatVersion(
          getHelmReleaseLastAttemptedRevision(deployment) ?? '',
        ),
        status,
        updated: getHelmReleaseUpdatedTimestamp(deployment),
        sourceKind: getHelmReleaseSourceKind(deployment),
        sourceName: getHelmReleaseSourceName(deployment),
        chartName,
        apiVersion: deployment.apiVersion,
        labels: calculateDeploymentLabels(deployment),
        entityRef,
        app,
      };
}
