/**
 * Central registry of Prometheus/Mimir metrics used in queries.
 *
 * Every metric the application queries should be defined here.
 * This provides a single place to see which metrics we depend on,
 * and exports constants for use in PromQL query construction.
 */

export interface PrometheusMetric {
  /** The full metric name as it appears in Prometheus/Mimir. */
  name: string;
  /** Human-readable description of what this metric measures. */
  description: string;
  /** Prometheus metric type. */
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  /** The exporter or component that produces this metric. */
  source: string;
}

export const ContainerCpuUsageSecondsTotal = {
  name: 'container_cpu_usage_seconds_total',
  description: 'Cumulative CPU time consumed by a container, in core-seconds.',
  type: 'counter',
  source: 'cAdvisor',
} as const satisfies PrometheusMetric;

export const ContainerMemoryWorkingSetBytes = {
  name: 'container_memory_working_set_bytes',
  description:
    'Current working set memory usage of a container, in bytes. This excludes cached memory that can be reclaimed under pressure.',
  type: 'gauge',
  source: 'cAdvisor',
} as const satisfies PrometheusMetric;

export const KubePodContainerResourceRequests = {
  name: 'kube_pod_container_resource_requests',
  description:
    'The resource requests (CPU or memory) configured for a container. The `resource` label indicates the resource type.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubePodContainerResourceLimits = {
  name: 'kube_pod_container_resource_limits',
  description:
    'The resource limits (CPU or memory) configured for a container. The `resource` label indicates the resource type.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDeploymentSpecReplicas = {
  name: 'kube_deployment_spec_replicas',
  description: 'Number of desired pods for a deployment.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDeploymentStatusReplicasReady = {
  name: 'kube_deployment_status_replicas_ready',
  description: 'Number of ready replicas for a deployment.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeStatefulsetReplicas = {
  name: 'kube_statefulset_replicas',
  description: 'Number of desired pods for a statefulset.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeStatefulsetStatusReplicasReady = {
  name: 'kube_statefulset_status_replicas_ready',
  description: 'Number of ready replicas for a statefulset.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDaemonsetStatusDesiredNumberScheduled = {
  name: 'kube_daemonset_status_desired_number_scheduled',
  description:
    'Number of nodes that should be running the daemon pod (including nodes with running daemon pod).',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDaemonsetStatusNumberReady = {
  name: 'kube_daemonset_status_number_ready',
  description: 'Number of nodes that have a daemon pod running and ready.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDeploymentLabels = {
  name: 'kube_deployment_labels',
  description:
    'Kubernetes labels of a deployment. Each label is exposed as a metric label with a `label_` prefix.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeStatefulsetLabels = {
  name: 'kube_statefulset_labels',
  description:
    'Kubernetes labels of a statefulset. Each label is exposed as a metric label with a `label_` prefix.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDaemonsetLabels = {
  name: 'kube_daemonset_labels',
  description:
    'Kubernetes labels of a daemonset. Each label is exposed as a metric label with a `label_` prefix.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubePodContainerStatusWaitingReason = {
  name: 'kube_pod_container_status_waiting_reason',
  description:
    'Describes the reason a container is currently in a waiting state. The `reason` label contains the specific reason (e.g. CrashLoopBackOff, ImagePullBackOff).',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubePodContainerStatusTerminatedReason = {
  name: 'kube_pod_container_status_terminated_reason',
  description:
    'Describes the reason a container is currently in a terminated state. The `reason` label contains the specific reason (e.g. OOMKilled, Error).',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubePodContainerStatusRestartsTotal = {
  name: 'kube_pod_container_status_restarts_total',
  description:
    'The number of container restarts, reported as a monotonically increasing counter per container.',
  type: 'counter',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubePodStatusPhase = {
  name: 'kube_pod_status_phase',
  description:
    'The pods current phase. The `phase` label contains the phase value (Pending, Running, Succeeded, Failed, Unknown).',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDeploymentStatusCondition = {
  name: 'kube_deployment_status_condition',
  description:
    'The current status conditions of a deployment. Labels include `condition` (Available, Progressing, ReplicaFailure) and `status` (true, false, unknown).',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDeploymentCreated = {
  name: 'kube_deployment_created',
  description: 'Unix creation timestamp for a deployment.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeStatefulsetCreated = {
  name: 'kube_statefulset_created',
  description: 'Unix creation timestamp for a statefulset.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

export const KubeDaemonsetCreated = {
  name: 'kube_daemonset_created',
  description: 'Unix creation timestamp for a daemonset.',
  type: 'gauge',
  source: 'kube-state-metrics',
} as const satisfies PrometheusMetric;

/**
 * All registered metrics. Use this to enumerate or inspect the full set
 * of metrics the application relies on.
 */
export const MetricsRegistry: readonly PrometheusMetric[] = [
  ContainerCpuUsageSecondsTotal,
  ContainerMemoryWorkingSetBytes,
  KubePodContainerResourceRequests,
  KubePodContainerResourceLimits,
  KubeDeploymentSpecReplicas,
  KubeDeploymentStatusReplicasReady,
  KubeStatefulsetReplicas,
  KubeStatefulsetStatusReplicasReady,
  KubeDaemonsetStatusDesiredNumberScheduled,
  KubeDaemonsetStatusNumberReady,
  KubeDeploymentLabels,
  KubeStatefulsetLabels,
  KubeDaemonsetLabels,
  KubePodContainerStatusWaitingReason,
  KubePodContainerStatusTerminatedReason,
  KubePodContainerStatusRestartsTotal,
  KubePodStatusPhase,
  KubeDeploymentStatusCondition,
  KubeDeploymentCreated,
  KubeStatefulsetCreated,
  KubeDaemonsetCreated,
];
