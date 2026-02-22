import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import { MimirQueryResponse } from '../../apis/mimir/types';

function extractScalar(
  response: MimirQueryResponse | undefined,
): number | undefined {
  const sample = response?.data?.result?.[0];
  if (!sample) return undefined;
  const raw = sample.value?.[1];
  if (raw === undefined) return undefined;
  const n = parseFloat(raw);
  return isNaN(n) ? undefined : n;
}

/**
 * Extracts a scalar value from a vector result that has been grouped by `resource`,
 * matching the given resource label (e.g. "cpu" or "memory").
 */
function extractScalarByResource(
  response: MimirQueryResponse | undefined,
  resource: string,
): number | undefined {
  const sample = response?.data?.result?.find(
    r => r.metric.resource === resource,
  );
  if (!sample) return undefined;
  const raw = sample.value?.[1];
  if (raw === undefined) return undefined;
  const n = parseFloat(raw);
  return isNaN(n) ? undefined : n;
}

export interface MimirResourceUsage {
  cpuUsage: number | undefined;
  cpuRequests: number | undefined;
  cpuLimits: number | undefined;
  memoryUsage: number | undefined;
  memoryRequests: number | undefined;
  memoryLimits: number | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useMimirResourceUsage(options: {
  installationName: string;
  clusterName: string | undefined;
  namespace: string;
  deploymentName: string;
}): MimirResourceUsage {
  const { installationName, clusterName, namespace, deploymentName } = options;

  const isEnabled = Boolean(clusterName && namespace && deploymentName);
  const labelSelector = `cluster_id="${clusterName}",namespace="${namespace}",pod=~"${deploymentName}-.*",container!=""`;

  const cpuUsageQuery = `sum(rate(container_cpu_usage_seconds_total{${labelSelector}}[5m]))`;
  const memoryUsageQuery = `sum(avg_over_time(container_memory_working_set_bytes{${labelSelector}}[5m]))`;
  const requestsQuery = `sum by (resource)(kube_pod_container_resource_requests{${labelSelector},resource=~"cpu|memory"})`;
  const limitsQuery = `sum by (resource)(kube_pod_container_resource_limits{${labelSelector},resource=~"cpu|memory"})`;

  const {
    data: cpuUsageData,
    isLoading: cpuUsageLoading,
    error: cpuUsageError,
  } = useMimirQuery({
    installationName,
    query: cpuUsageQuery,
    enabled: isEnabled,
  });

  const {
    data: memoryUsageData,
    isLoading: memoryUsageLoading,
    error: memoryUsageError,
  } = useMimirQuery({
    installationName,
    query: memoryUsageQuery,
    enabled: isEnabled,
  });

  const {
    data: requestsData,
    isLoading: requestsLoading,
    error: requestsError,
  } = useMimirQuery({
    installationName,
    query: requestsQuery,
    enabled: isEnabled,
  });

  const { data: limitsData, isLoading: limitsLoading } = useMimirQuery({
    installationName,
    query: limitsQuery,
    enabled: isEnabled,
  });

  return useMemo(
    () => ({
      cpuUsage: extractScalar(cpuUsageData),
      cpuRequests: extractScalarByResource(requestsData, 'cpu'),
      cpuLimits: extractScalarByResource(limitsData, 'cpu'),
      memoryUsage: extractScalar(memoryUsageData),
      memoryRequests: extractScalarByResource(requestsData, 'memory'),
      memoryLimits: extractScalarByResource(limitsData, 'memory'),
      isLoading:
        cpuUsageLoading ||
        memoryUsageLoading ||
        requestsLoading ||
        limitsLoading,
      error: cpuUsageError || memoryUsageError || requestsError,
    }),
    [
      cpuUsageData,
      memoryUsageData,
      requestsData,
      limitsData,
      cpuUsageLoading,
      memoryUsageLoading,
      requestsLoading,
      limitsLoading,
      cpuUsageError,
      memoryUsageError,
      requestsError,
    ],
  );
}
