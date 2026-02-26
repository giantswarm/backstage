import { Entity } from '@backstage/catalog-model';
import { MimirWorkload } from '../../hooks/useMimirWorkloads';
import { ClusterTypes } from '../../clusters/utils';
import { DeploymentData } from './utils';

function deriveStatus(desired: number, ready: number): string {
  if (desired === 0) return 'suspended';
  if (ready >= desired) return 'successful';
  if (ready > 0) return 'pending';
  return 'failed';
}

export function workloadToDeploymentData(
  workload: MimirWorkload,
): DeploymentData {
  return {
    installationName: workload.installationName,
    kind: workload.kind,
    clusterName: workload.clusterName,
    clusterType:
      workload.clusterName === workload.installationName
        ? ClusterTypes.Management
        : ClusterTypes.Workload,
    name: workload.name,
    namespace: workload.namespace,
    targetNamespace: workload.namespace,
    version: workload.kubeLabels['app.kubernetes.io/version'] || '',
    attemptedVersion: workload.kubeLabels['app.kubernetes.io/version'] || '',
    updated: workload.createdTimestamp
      ? new Date(workload.createdTimestamp * 1000).toISOString()
      : undefined,
    status: deriveStatus(workload.desiredReplicas, workload.readyReplicas),
    apiVersion: '',
    replicaStatus: {
      desired: workload.desiredReplicas,
      ready: workload.readyReplicas,
    },
    kubeLabels: workload.kubeLabels,
    rawMetrics: workload.rawMetrics,
  };
}

export function mergeWorkloads(
  crdData: DeploymentData[],
  mimirData: DeploymentData[],
  catalogEntitiesMap: Record<string, Entity>,
): DeploymentData[] {
  // Build lookup from Mimir entries keyed by clusterName/namespace/name
  const mimirByKey = new Map<string, DeploymentData>();
  for (const item of mimirData) {
    const key = `${item.clusterName}/${item.targetNamespace}/${item.name}`;
    mimirByKey.set(key, item);
  }

  const consumed = new Set<string>();

  // Enrich CRD entries with matching Mimir data
  const enrichedCrdData = crdData.map(crd => {
    // Primary: match by chartName (HelmRelease "operations-demotech-backstage" → chart "backstage")
    const chartKey = crd.chartName
      ? `${crd.clusterName}/${crd.targetNamespace}/${crd.chartName}`
      : undefined;

    // Fallback: match by CRD name
    const nameKey = `${crd.clusterName}/${crd.targetNamespace}/${crd.name}`;

    const matchKey =
      (chartKey && mimirByKey.has(chartKey) ? chartKey : undefined) ??
      (mimirByKey.has(nameKey) ? nameKey : undefined);

    if (matchKey) {
      const mimirEntry = mimirByKey.get(matchKey)!;
      consumed.add(matchKey);
      return {
        ...crd,
        replicaStatus: mimirEntry.replicaStatus,
        kubeLabels: mimirEntry.kubeLabels,
        rawMetrics: mimirEntry.rawMetrics,
      };
    }

    return crd;
  });

  // Remaining Mimir entries that didn't match any CRD — try to match to catalog entities
  const unconsumedMimir = mimirData
    .filter(item => {
      const key = `${item.clusterName}/${item.targetNamespace}/${item.name}`;
      return !consumed.has(key);
    })
    .map(item => {
      const entity =
        catalogEntitiesMap[item.name] ??
        (item.kubeLabels?.['app.kubernetes.io/name']
          ? catalogEntitiesMap[item.kubeLabels['app.kubernetes.io/name']]
          : undefined);

      if (entity) {
        return { ...item, entity, app: entity.metadata.name };
      }
      return item;
    });

  return [...enrichedCrdData, ...unconsumedMimir];
}
