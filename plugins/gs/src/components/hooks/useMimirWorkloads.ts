import { useMemo } from 'react';
import { keepPreviousData, useQueries } from '@tanstack/react-query';
import { isAwaitingData } from '@giantswarm/backstage-plugin-ui-react';
import { MimirMetricSample } from '../../apis/mimir';
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
import { mimirQueryRetry } from './mimirRetry';
import { sanitizePromQLValue } from './promql';
import { useMimirInstallations } from './useMimirInstallations';
import { useMimirQueryFn } from './useMimirQueryFn';

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

/**
 * The query for one workload metric, scoped to the given clusters: a metric
 * with no `cluster_id` selector aggregates over every cluster and workload of
 * the installation, which is what times Mimir out under load.
 */
export function buildWorkloadQuery(
  metric: string,
  clusterIds: string[],
): string {
  const ids = clusterIds.map(sanitizePromQLValue).join('|');
  return `max without(${WORKLOAD_NOISE_LABELS.join(', ')}) (${metric}{cluster_id=~"${ids}"})`;
}

interface QueryDef {
  installationName: string;
  metric: string;
  query: string;
  kind: WorkloadKind;
  nameLabel: string;
  role: 'desired' | 'ready' | 'labels' | 'created';
}

/** The clusters to query per installation: `cluster_id` values. */
export type ClustersByInstallation = Record<string, string[]>;

function buildQueryDefs(
  clustersByInstallation: ClustersByInstallation,
): QueryDef[] {
  const defs: QueryDef[] = [];
  for (const [installationName, clusters] of Object.entries(
    clustersByInstallation,
  )) {
    // Sorted and deduplicated, so the same clusters render the same query
    // (and the same query key) whatever order the caller found them in.
    const clusterIds = [...new Set(clusters)].sort();
    if (clusterIds.length === 0) continue;

    for (const wm of WORKLOAD_METRICS) {
      const roles = [
        ['desired', wm.desiredMetric],
        ['ready', wm.readyMetric],
        ['labels', wm.labelsMetric],
        ['created', wm.createdMetric],
      ] as const;
      for (const [role, metric] of roles) {
        defs.push({
          installationName,
          metric,
          query: buildWorkloadQuery(metric, clusterIds),
          kind: wm.kind,
          nameLabel: wm.nameLabel,
          role,
        });
      }
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

/**
 * The workloads (Deployments, StatefulSets, DaemonSets) of the given clusters,
 * read from each installation's Mimir.
 *
 * `clustersByInstallation` names the clusters to query per installation. It is
 * `undefined` while the caller is still working out which clusters it shows:
 * nothing is queried and `isLoading` is true.
 */
export function useMimirWorkloads(options: {
  clustersByInstallation: ClustersByInstallation | undefined;
}): {
  workloads: MimirWorkload[];
  isLoading: boolean;
  errors: Error[];
} {
  const { clustersByInstallation } = options;

  const queryMimir = useMimirQueryFn();

  const installations = useMemo(
    () => Object.keys(clustersByInstallation ?? {}),
    [clustersByInstallation],
  );

  // Installations without Mimir (`mimirEnabled: false`) are skipped entirely —
  // their queries could only fail, and the deployments list is complete
  // without metrics there. Until the installations config loads, no queries
  // are built and `isLoading` stays true.
  const { installations: mimirInstallations, isLoading: isLoadingConfig } =
    useMimirInstallations(installations);

  const queryDefs = useMemo(() => {
    if (!clustersByInstallation) return [];
    const withMimir: ClustersByInstallation = {};
    for (const installationName of mimirInstallations) {
      withMimir[installationName] = clustersByInstallation[installationName];
    }
    return buildQueryDefs(withMimir);
  }, [clustersByInstallation, mimirInstallations]);

  const queryResults = useQueries({
    queries: queryDefs.map(def => ({
      queryKey: ['mimir-workloads', def.installationName, def.query],
      queryFn: async (): Promise<MimirMetricSample[]> => {
        const response = await queryMimir(def.installationName, def.query);
        return response.data?.result ?? [];
      },
      // The key holds the installation's cluster ids, so it changes as
      // clusters come and go; the workloads already answered stay shown.
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      retry: mimirQueryRetry,
    })),
  });

  const isLoading =
    clustersByInstallation === undefined ||
    isLoadingConfig ||
    queryResults.some(q => isAwaitingData(q));

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
