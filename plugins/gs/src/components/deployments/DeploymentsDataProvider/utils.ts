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
import { calculateClusterType } from '../utils';
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
};

export function collectDeploymentData({
  installationName,
  deployment,
}: {
  installationName: string;
  deployment: Deployment;
}): DeploymentData {
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
        status: getAppStatus(deployment),
        updated: getAppUpdatedTimestamp(deployment),
        sourceKind: 'AppCatalog',
        sourceName: formatAppCatalogName(getAppCatalogName(deployment) ?? ''),
        chartName: getAppChartName(deployment),
        apiVersion: deployment.apiVersion,
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
        status: getHelmReleaseStatus(deployment),
        updated: getHelmReleaseUpdatedTimestamp(deployment),
        sourceKind: getHelmReleaseSourceKind(deployment),
        sourceName: getHelmReleaseSourceName(deployment),
        chartName: getHelmReleaseChartName(deployment),
        apiVersion: deployment.apiVersion,
      };
}
