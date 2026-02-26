import { useMemo } from 'react';
import { useApi } from '@backstage/core-plugin-api';
import {
  kubernetesApiRef,
  kubernetesAuthProvidersApiRef,
} from '@backstage/plugin-kubernetes-react';
import { useQueries } from '@tanstack/react-query';
import { mimirApiRef, MimirMetricSample } from '../../apis/mimir';
import {
  KubeDeploymentSpecReplicas,
  KubeDeploymentStatusReplicasReady,
  KubeStatefulsetReplicas,
  KubeStatefulsetStatusReplicasReady,
  KubeDaemonsetStatusDesiredNumberScheduled,
  KubeDaemonsetStatusNumberReady,
  KubeDeploymentLabels,
  KubeStatefulsetLabels,
  KubeDaemonsetLabels,
  KubeDeploymentCreated,
  KubeStatefulsetCreated,
  KubeDaemonsetCreated,
} from '../../apis/mimir/metrics';

export type WorkloadKind = 'deployment' | 'statefulset' | 'daemonset';

export interface MimirWorkloadMetric {
  metricName: string;
  labels: Record<string, string>;
  value: number;
}

export interface MimirWorkload {
  installationName: string;
  kind: WorkloadKind;
  name: string;
  namespace: string;
  clusterName: string;
  desiredReplicas: number;
  readyReplicas: number;
  createdTimestamp: number | undefined;
  kubeLabels: Record<string, string>;
  rawMetrics: MimirWorkloadMetric[];
}

interface WorkloadMetricDef {
  kind: WorkloadKind;
  nameLabel: string;
  desiredMetric: string;
  readyMetric: string;
  labelsMetric: string;
  createdMetric: string;
}

const WORKLOAD_METRICS: WorkloadMetricDef[] = [
  {
    kind: 'deployment',
    nameLabel: 'deployment',
    desiredMetric: KubeDeploymentSpecReplicas.name,
    readyMetric: KubeDeploymentStatusReplicasReady.name,
    labelsMetric: KubeDeploymentLabels.name,
    createdMetric: KubeDeploymentCreated.name,
  },
  {
    kind: 'statefulset',
    nameLabel: 'statefulset',
    desiredMetric: KubeStatefulsetReplicas.name,
    readyMetric: KubeStatefulsetStatusReplicasReady.name,
    labelsMetric: KubeStatefulsetLabels.name,
    createdMetric: KubeStatefulsetCreated.name,
  },
  {
    kind: 'daemonset',
    nameLabel: 'daemonset',
    desiredMetric: KubeDaemonsetStatusDesiredNumberScheduled.name,
    readyMetric: KubeDaemonsetStatusNumberReady.name,
    labelsMetric: KubeDaemonsetLabels.name,
    createdMetric: KubeDaemonsetCreated.name,
  },
];

// Explicit mapping from kube-state-metrics label metric keys to Kubernetes
// label names. The `_` encoding is lossy (both `.` and `/` become `_`), so
// we use a fixed map for the labels we care about and ignore the rest.
const KNOWN_LABEL_KEYS: Record<string, string> = {
  label_app_kubernetes_io_instance: 'app.kubernetes.io/instance',
  label_app_kubernetes_io_name: 'app.kubernetes.io/name',
  label_app_kubernetes_io_version: 'app.kubernetes.io/version',
  label_application_giantswarm_io_team: 'application.giantswarm.io/team',
  label_app_kubernetes_io_component: 'app.kubernetes.io/component',
};

// Labels that add no value for workload queries — produced by the scrape
// pipeline (job, instance, pod, container, endpoint, service) or by our
// recording-rule / federation setup (app, customer, pipeline, provider,
// region, service_priority). Stripping them server-side with `without`
// reduces response payloads and avoids duplicate series from redundant
// Prometheus replicas.
const WORKLOAD_NOISE_LABELS = [
  'app',
  'container',
  'customer',
  'endpoint',
  'instance',
  'job',
  'pipeline',
  'pod',
  'provider',
  'region',
  'service',
  'service_priority',
];

function wrapWithout(metric: string): string {
  return `max without(${WORKLOAD_NOISE_LABELS.join(', ')}) (${metric})`;
}

interface QueryDef {
  installationName: string;
  metric: string;
  query: string;
  kind: WorkloadKind;
  nameLabel: string;
  role: 'desired' | 'ready' | 'labels' | 'created';
}

function buildQueryDefs(installations: string[]): QueryDef[] {
  const defs: QueryDef[] = [];
  for (const installationName of installations) {
    for (const wm of WORKLOAD_METRICS) {
      defs.push({
        installationName,
        metric: wm.desiredMetric,
        query: wrapWithout(wm.desiredMetric),
        kind: wm.kind,
        nameLabel: wm.nameLabel,
        role: 'desired',
      });
      defs.push({
        installationName,
        metric: wm.readyMetric,
        query: wrapWithout(wm.readyMetric),
        kind: wm.kind,
        nameLabel: wm.nameLabel,
        role: 'ready',
      });
      defs.push({
        installationName,
        metric: wm.labelsMetric,
        query: wrapWithout(wm.labelsMetric),
        kind: wm.kind,
        nameLabel: wm.nameLabel,
        role: 'labels',
      });
      defs.push({
        installationName,
        metric: wm.createdMetric,
        query: wrapWithout(wm.createdMetric),
        kind: wm.kind,
        nameLabel: wm.nameLabel,
        role: 'created',
      });
    }
  }
  return defs;
}

function mergeResults(
  queryDefs: QueryDef[],
  results: (MimirMetricSample[] | undefined)[],
): MimirWorkload[] {
  // Key: installationName/kind/clusterName/namespace/name
  const workloadMap = new Map<string, MimirWorkload>();

  queryDefs.forEach((def, index) => {
    const samples = results[index];
    if (!samples) return;

    for (const sample of samples) {
      const name = sample.metric[def.nameLabel];
      const namespace = sample.metric.namespace ?? '';
      const clusterName = sample.metric.cluster_id ?? def.installationName;

      if (!name) continue;

      const key = `${def.installationName}/${def.kind}/${clusterName}/${namespace}/${name}`;
      let entry = workloadMap.get(key);
      if (!entry) {
        entry = {
          installationName: def.installationName,
          kind: def.kind,
          name,
          namespace,
          clusterName,
          desiredReplicas: 0,
          readyReplicas: 0,
          createdTimestamp: undefined,
          kubeLabels: {},
          rawMetrics: [],
        };
        workloadMap.set(key, entry);
      }

      const value = parseFloat(sample.value[1]);

      if (def.role === 'labels') {
        // Extract only known label keys using the explicit mapping
        for (const [labelKey, labelValue] of Object.entries(sample.metric)) {
          const k8sLabel = KNOWN_LABEL_KEYS[labelKey];
          if (k8sLabel) {
            entry.kubeLabels[k8sLabel] = labelValue;
          }
        }
      } else if (!isNaN(value)) {
        if (def.role === 'desired') {
          entry.desiredReplicas = value;
        } else if (def.role === 'ready') {
          entry.readyReplicas = value;
        } else if (def.role === 'created') {
          entry.createdTimestamp = value;
        }
      }

      entry.rawMetrics.push({
        metricName: def.metric,
        labels: { ...sample.metric },
        value: isNaN(value) ? 0 : value,
      });
    }
  });

  return Array.from(workloadMap.values());
}

export function useMimirWorkloads(options: { installations: string[] }): {
  workloads: MimirWorkload[];
  isLoading: boolean;
  errors: Error[];
} {
  const { installations } = options;

  const mimirApi = useApi(mimirApiRef);
  const kubernetesApi = useApi(kubernetesApiRef);
  const kubernetesAuthProvidersApi = useApi(kubernetesAuthProvidersApiRef);

  const queryDefs = useMemo(
    () => buildQueryDefs(installations),
    [installations],
  );

  const queryResults = useQueries({
    queries: queryDefs.map(def => ({
      queryKey: ['mimir-workloads', def.installationName, def.query],
      queryFn: async (): Promise<MimirMetricSample[]> => {
        const cluster = await kubernetesApi.getCluster(def.installationName);
        if (!cluster) {
          throw new Error(`Cluster ${def.installationName} not found`);
        }

        const authProvider =
          cluster.authProvider === 'oidc'
            ? `${cluster.authProvider}.${cluster.oidcTokenProvider}`
            : cluster.authProvider;

        const credentials =
          await kubernetesAuthProvidersApi.getCredentials(authProvider);

        if (!credentials.token) {
          throw new Error(
            `No OIDC token available for installation "${def.installationName}"`,
          );
        }

        const response = await mimirApi.query({
          installationName: def.installationName,
          query: def.query,
          oidcToken: credentials.token,
        });

        return response.data?.result ?? [];
      },
      enabled: installations.length > 0,
      staleTime: 30_000,
    })),
  });

  const isLoading = queryResults.some(q => q.isLoading);

  const errors = useMemo(
    () =>
      queryResults
        .map(q => q.error)
        .filter((e): e is Error => e !== null && e !== undefined),
    [queryResults],
  );

  const workloads = useMemo(() => {
    const samples = queryResults.map(q => q.data);
    return mergeResults(queryDefs, samples);
  }, [queryDefs, queryResults]);

  return { workloads, isLoading, errors };
}
