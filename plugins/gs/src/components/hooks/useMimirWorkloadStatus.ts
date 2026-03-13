import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { MimirQueryResponse, MimirMetricSample } from '../../apis/mimir/types';
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

interface WorkloadKindInfo {
  kind: WorkloadReplicaStatus['kind'];
  nameLabel: string;
  desiredMetric: string;
  readyMetric: string;
}

const workloadKinds: WorkloadKindInfo[] = [
  {
    kind: 'Deployment',
    nameLabel: 'deployment',
    desiredMetric: KubeDeploymentSpecReplicas.name,
    readyMetric: KubeDeploymentStatusReplicasReady.name,
  },
  {
    kind: 'StatefulSet',
    nameLabel: 'statefulset',
    desiredMetric: KubeStatefulsetReplicas.name,
    readyMetric: KubeStatefulsetStatusReplicasReady.name,
  },
  {
    kind: 'DaemonSet',
    nameLabel: 'daemonset',
    desiredMetric: KubeDaemonsetStatusDesiredNumberScheduled.name,
    readyMetric: KubeDaemonsetStatusNumberReady.name,
  },
];

export function buildOrQuery(
  clusterSelector: string,
  podPrefix: string,
  metricKey: 'desiredMetric' | 'readyMetric',
): string {
  return workloadKinds
    .map(
      k =>
        `${k[metricKey]}{${clusterSelector},${k.nameLabel}=~"${podPrefix}.*"}`,
    )
    .join(' or ');
}

function parseValue(sample: MimirMetricSample): number {
  const n = parseFloat(sample.value?.[1] ?? '0');
  return isNaN(n) ? 0 : n;
}

export function buildWorkloads(
  desiredResponse: MimirQueryResponse | undefined,
  readyResponse: MimirQueryResponse | undefined,
): WorkloadReplicaStatus[] {
  const desiredResults = desiredResponse?.data?.result ?? [];
  const readyResults = readyResponse?.data?.result ?? [];

  const readyMap = new Map<string, number>();
  for (const sample of readyResults) {
    const metricName = sample.metric.__name__;
    const kindInfo = workloadKinds.find(k => k.readyMetric === metricName);
    if (!kindInfo) continue;
    const name = sample.metric[kindInfo.nameLabel];
    if (name) {
      readyMap.set(`${kindInfo.kind}:${name}`, parseValue(sample));
    }
  }

  const workloads: WorkloadReplicaStatus[] = [];
  for (const sample of desiredResults) {
    const metricName = sample.metric.__name__;
    const kindInfo = workloadKinds.find(k => k.desiredMetric === metricName);
    if (!kindInfo) continue;
    const name = sample.metric[kindInfo.nameLabel];
    if (!name) continue;
    workloads.push({
      kind: kindInfo.kind,
      name,
      desiredReplicas: parseValue(sample),
      readyReplicas: readyMap.get(`${kindInfo.kind}:${name}`) ?? 0,
    });
  }

  return workloads;
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

  const desiredQuery = buildOrQuery(
    clusterSelector,
    podPrefix,
    'desiredMetric',
  );
  const readyQuery = buildOrQuery(clusterSelector, podPrefix, 'readyMetric');

  const queryOpts = { installationName, enabled: isEnabled, refetchInterval };

  const {
    data: desiredData,
    isLoading: desiredLoading,
    error: desiredError,
  } = useMimirQuery({ ...queryOpts, query: desiredQuery });

  const {
    data: readyData,
    isLoading: readyLoading,
    error: readyError,
  } = useMimirQuery({ ...queryOpts, query: readyQuery });

  const isLoading = desiredLoading || readyLoading;
  const error = desiredError || readyError;

  const workloads = useMemo(
    () => buildWorkloads(desiredData, readyData),
    [desiredData, readyData],
  );

  return { workloads, isLoading, isEnabled, error };
}
