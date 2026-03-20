import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import {
  KubeNodeStatusAllocatable,
  KubeNodeStatusCondition,
  KubeNodeCreated,
  KubeNodeLabels,
  KubeletRunningPods,
  KubePodContainerResourceRequests,
} from '../../apis/mimir/metrics';
import { MimirQueryResponse } from '../../apis/mimir/types';

export interface NodePoolNode {
  id: string;
  node: string;
  instanceType: string | undefined;
  zone: string | undefined;
  ready: boolean;
  conditions: string[];
  cpuAllocatable: number | undefined;
  cpuRequests: number | undefined;
  memoryAllocatable: number | undefined;
  memoryRequests: number | undefined;
  podsAllocatable: number | undefined;
  runningPods: number | undefined;
  created: Date | undefined;
}

const REFETCH_INTERVAL = 30_000;

/**
 * Sanitize a value for use inside a PromQL label matcher string.
 * Strips characters that could break or escape the matcher: `"`, `}`, `\`, newlines.
 */
function sanitizePromQLValue(value: string): string {
  return value.replace(/["}\\\n\r]/g, '');
}

function buildQuery(clusterName: string, nodePoolName: string): string {
  const safeCluster = sanitizePromQLValue(clusterName);
  const safeNodePool = sanitizePromQLValue(nodePoolName);
  const l = `cluster_id="${safeCluster}"`;
  const byNR = 'node, cluster_id, resource'; // group-by for left side

  return [
    '(',
    `  max by (${byNR}) (${KubeNodeStatusAllocatable.name}{${l}, resource=~"cpu|memory|pods"})`,
    `  or label_replace(sum by (node, cluster_id) (${KubePodContainerResourceRequests.name}{${l}, resource="cpu", node!=""}), "resource", "cpu_requests", "", "")`,
    `  or label_replace(sum by (node, cluster_id) (${KubePodContainerResourceRequests.name}{${l}, resource="memory", node!=""}), "resource", "memory_requests", "", "")`,
    `  or max by (${byNR}) (label_replace(${KubeletRunningPods.name}{${l}}, "resource", "running_pods", "", ""))`,
    `  or max by (${byNR}) (label_replace(${KubeNodeStatusCondition.name}{${l}, condition="Ready", status="true"}, "resource", "ready", "", ""))`,
    `  or max by (${byNR}) (label_replace(${KubeNodeStatusCondition.name}{${l}, condition!="Ready", status="true"} == 1, "resource", "condition_$1", "condition", "(.*)"))`,
    `  or max by (${byNR}) (label_replace(${KubeNodeCreated.name}{${l}}, "resource", "created", "", ""))`,
    ')',
    '* on(node, cluster_id) group_left(nodepool, label_node_kubernetes_io_instance_type, zone)',
    `  max by (node, cluster_id, nodepool, label_node_kubernetes_io_instance_type, zone) (${KubeNodeLabels.name}{${l}, nodepool="${safeNodePool}"})`,
  ].join(' ');
}

function parseResponse(data: MimirQueryResponse | undefined): NodePoolNode[] {
  if (!data?.data?.result?.length) return [];

  const nodeMap = new Map<
    string,
    {
      instanceType?: string;
      zone?: string;
      ready: boolean;
      conditions: string[];
      cpuAllocatable?: number;
      cpuRequests?: number;
      memoryAllocatable?: number;
      memoryRequests?: number;
      podsAllocatable?: number;
      runningPods?: number;
      created?: Date;
    }
  >();

  for (const sample of data.data.result) {
    const node = sample.metric.node;
    if (!node) continue;

    if (!nodeMap.has(node)) {
      nodeMap.set(node, {
        instanceType: sample.metric.label_node_kubernetes_io_instance_type,
        zone: sample.metric.zone,
        ready: false,
        conditions: [],
      });
    }

    const entry = nodeMap.get(node)!;
    const value = parseFloat(sample.value[1]);
    const resource = sample.metric.resource;

    switch (resource) {
      case 'cpu':
        entry.cpuAllocatable = value;
        break;
      case 'cpu_requests':
        entry.cpuRequests = value;
        break;
      case 'memory':
        entry.memoryAllocatable = value;
        break;
      case 'memory_requests':
        entry.memoryRequests = value;
        break;
      case 'pods':
        entry.podsAllocatable = value;
        break;
      case 'running_pods':
        entry.runningPods = value;
        break;
      case 'ready':
        entry.ready = value === 1;
        break;
      case 'created':
        entry.created = new Date(value * 1000);
        break;
      default:
        if (resource?.startsWith('condition_') && value === 1) {
          entry.conditions.push(resource.replace('condition_', ''));
        }
        break;
    }
  }

  return Array.from(nodeMap.entries()).map(([node, entry]) => ({
    id: node,
    node,
    instanceType: entry.instanceType,
    zone: entry.zone,
    ready: entry.ready,
    conditions: entry.conditions,
    cpuAllocatable: entry.cpuAllocatable,
    cpuRequests: entry.cpuRequests,
    memoryAllocatable: entry.memoryAllocatable,
    memoryRequests: entry.memoryRequests,
    podsAllocatable: entry.podsAllocatable,
    runningPods: entry.runningPods,
    created: entry.created,
  }));
}

export function useMimirNodePoolNodes(options: {
  installationName: string;
  clusterName: string;
  nodePoolName: string | null;
}): {
  nodes: NodePoolNode[];
  isLoading: boolean;
  error: Error | null;
} {
  const { installationName, clusterName, nodePoolName } = options;

  const query = useMemo(
    () =>
      clusterName && nodePoolName ? buildQuery(clusterName, nodePoolName) : '',
    [clusterName, nodePoolName],
  );

  const { data, isLoading, error } = useMimirQuery({
    installationName,
    query,
    enabled: Boolean(clusterName && nodePoolName),
    refetchInterval: REFETCH_INTERVAL,
  });

  const nodes = useMemo(() => parseResponse(data), [data]);

  return { nodes, isLoading, error };
}
