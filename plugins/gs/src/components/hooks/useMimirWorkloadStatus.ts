import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { MimirQueryResponse } from '../../apis/mimir/types';
import {
  KubeDeploymentSpecReplicas,
  KubeDeploymentStatusReplicasReady,
  KubeStatefulsetReplicas,
  KubeStatefulsetStatusReplicasReady,
  KubeDaemonsetStatusDesiredNumberScheduled,
  KubeDaemonsetStatusNumberReady,
} from '../../apis/mimir/metrics';

export interface WorkloadReplicaStatus {
  kind: 'Deployment' | 'StatefulSet' | 'DaemonSet';
  name: string;
  desiredReplicas: number;
  readyReplicas: number;
}

function extractWorkloads(
  desiredResponse: MimirQueryResponse | undefined,
  readyResponse: MimirQueryResponse | undefined,
  kind: WorkloadReplicaStatus['kind'],
  nameLabel: string,
): WorkloadReplicaStatus[] {
  const desiredResults = desiredResponse?.data?.result ?? [];
  if (desiredResults.length === 0) return [];

  const readyMap = new Map<string, number>();
  for (const sample of readyResponse?.data?.result ?? []) {
    const name = sample.metric[nameLabel];
    const val = parseFloat(sample.value?.[1] ?? '0');
    if (name && !isNaN(val)) {
      readyMap.set(name, val);
    }
  }

  return desiredResults
    .map(sample => {
      const name = sample.metric[nameLabel];
      const desired = parseFloat(sample.value?.[1] ?? '0');
      if (!name || isNaN(desired)) return null;
      return {
        kind,
        name,
        desiredReplicas: desired,
        readyReplicas: readyMap.get(name) ?? 0,
      };
    })
    .filter((w): w is WorkloadReplicaStatus => w !== null);
}

export function useMimirWorkloadStatus(options: {
  installationName: string;
  clusterName: string | undefined;
  namespace: string;
  podPrefix: string;
  refetchInterval?: number | false;
}) {
  const {
    installationName,
    clusterName,
    namespace,
    podPrefix,
    refetchInterval = 30_000,
  } = options;

  const isEnabled = Boolean(clusterName && namespace && podPrefix);
  const clusterSelector = `cluster_id="${clusterName}",namespace="${namespace}"`;

  // Deployment queries
  const deployDesiredQuery = `${KubeDeploymentSpecReplicas.name}{${clusterSelector},deployment=~"${podPrefix}.*"}`;
  const deployReadyQuery = `${KubeDeploymentStatusReplicasReady.name}{${clusterSelector},deployment=~"${podPrefix}.*"}`;

  // StatefulSet queries
  const stsDesiredQuery = `${KubeStatefulsetReplicas.name}{${clusterSelector},statefulset=~"${podPrefix}.*"}`;
  const stsReadyQuery = `${KubeStatefulsetStatusReplicasReady.name}{${clusterSelector},statefulset=~"${podPrefix}.*"}`;

  // DaemonSet queries
  const dsDesiredQuery = `${KubeDaemonsetStatusDesiredNumberScheduled.name}{${clusterSelector},daemonset=~"${podPrefix}.*"}`;
  const dsReadyQuery = `${KubeDaemonsetStatusNumberReady.name}{${clusterSelector},daemonset=~"${podPrefix}.*"}`;

  const queryOpts = { installationName, enabled: isEnabled, refetchInterval };

  const {
    data: deployDesired,
    isLoading: l1,
    error: e1,
  } = useMimirQuery({
    ...queryOpts,
    query: deployDesiredQuery,
  });
  const {
    data: deployReady,
    isLoading: l2,
    error: e2,
  } = useMimirQuery({
    ...queryOpts,
    query: deployReadyQuery,
  });
  const {
    data: stsDesired,
    isLoading: l3,
    error: e3,
  } = useMimirQuery({
    ...queryOpts,
    query: stsDesiredQuery,
  });
  const {
    data: stsReady,
    isLoading: l4,
    error: e4,
  } = useMimirQuery({
    ...queryOpts,
    query: stsReadyQuery,
  });
  const {
    data: dsDesired,
    isLoading: l5,
    error: e5,
  } = useMimirQuery({
    ...queryOpts,
    query: dsDesiredQuery,
  });
  const {
    data: dsReady,
    isLoading: l6,
    error: e6,
  } = useMimirQuery({
    ...queryOpts,
    query: dsReadyQuery,
  });

  const isLoading = l1 || l2 || l3 || l4 || l5 || l6;
  const error = e1 || e2 || e3 || e4 || e5 || e6;

  const workloads = useMemo(() => {
    return [
      ...extractWorkloads(
        deployDesired,
        deployReady,
        'Deployment',
        'deployment',
      ),
      ...extractWorkloads(stsDesired, stsReady, 'StatefulSet', 'statefulset'),
      ...extractWorkloads(dsDesired, dsReady, 'DaemonSet', 'daemonset'),
    ];
  }, [deployDesired, deployReady, stsDesired, stsReady, dsDesired, dsReady]);

  return { workloads, isLoading, isEnabled, error };
}
