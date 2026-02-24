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
  description:
    'Cumulative CPU time consumed by a container, in core-seconds.',
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

/**
 * All registered metrics. Use this to enumerate or inspect the full set
 * of metrics the application relies on.
 */
export const MetricsRegistry: readonly PrometheusMetric[] = [
  ContainerCpuUsageSecondsTotal,
  ContainerMemoryWorkingSetBytes,
  KubePodContainerResourceRequests,
  KubePodContainerResourceLimits,
];
