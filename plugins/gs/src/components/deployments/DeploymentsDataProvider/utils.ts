import { Entity } from '@backstage/catalog-model';
import { formatVersion } from '../../utils/helpers';
import {
  App,
  HelmRelease,
  OCIRepository,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  findTargetClusterName,
  findTargetClusterNamespace,
  findTargetClusterType,
} from '../utils/findTargetCluster';
import { getAggregatedStatus } from '../utils/getStatus';
import { calculateDeploymentLabels } from '../utils/calculateLabels';
import { getUpdatedTimestamp } from '../utils/getUpdatedTimestamp';
import { getSourceKind, getSourceName } from '../utils/getSource';
import { getAttemptedVersion, getVersion } from '../utils/getVersion';
import { findHelmChartName } from '../utils/findHelmChartName';

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
  entity?: Entity;
  app?: string;
};

export function collectDeploymentData({
  deployment,
  ociRepository,
  catalogEntitiesMap,
}: {
  deployment: App | HelmRelease;
  ociRepository?: OCIRepository | null;
  catalogEntitiesMap: { [deploymentName: string]: Entity };
}): DeploymentData {
  const chartName = findHelmChartName(deployment, ociRepository);
  const entity = chartName ? catalogEntitiesMap[chartName] : undefined;
  const app = entity ? entity.metadata.name : undefined;

  const version = getVersion(deployment);
  const attemptedVersion = getAttemptedVersion(deployment);

  return {
    installationName: deployment.cluster,
    kind: deployment.getKind().toLowerCase(),
    clusterName: findTargetClusterName(deployment),
    clusterNamespace: findTargetClusterNamespace(deployment),
    clusterType: findTargetClusterType(deployment),
    name: deployment.getName(),
    namespace: deployment.getNamespace(),
    version: formatVersion(version ?? ''),
    attemptedVersion: formatVersion(attemptedVersion ?? ''),
    status: getAggregatedStatus(deployment),
    updated: getUpdatedTimestamp(deployment),
    sourceKind: getSourceKind(deployment),
    sourceName: getSourceName(deployment),
    chartName,
    apiVersion: deployment.getApiVersion(),
    labels: calculateDeploymentLabels(deployment),
    entity,
    app,
  };
}
