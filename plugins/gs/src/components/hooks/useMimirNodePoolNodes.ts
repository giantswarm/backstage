import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import {
  KubeNodeStatusAllocatable,
  KubeNodeStatusCondition,
  KubeNodeCreated,
  KubeNodeLabels,
  KubeletRunningPods,
} from '../../apis/mimir/metrics';
import { MimirQueryResponse } from '../../apis/mimir/types';

export interface NodePoolNode {
  node: string;
  instanceType: string | undefined;
  zone: string | undefined;
  ready: boolean;
  cpuAllocatable: number | undefined;
  memoryAllocatable: number | undefined;
  podsAllocatable: number | undefined;
  runningPods: number | undefined;
  created: Date | undefined;
}

const REFETCH_INTERVAL = 30_000;

function buildQuery(clusterName: string, nodePoolName: string): string {
  const labels = `cluster_id="${clusterName}"`;
  const nodeLabelsFilter = `${KubeNodeLabels.name}{${labels}, nodepool="${nodePoolName}"}`;

  return [
    '(',
    `  ${KubeNodeStatusAllocatable.name}{${labels}, resource=~"cpu|memory|pods"}`,
    `  or label_replace(${KubeletRunningPods.name}{${labels}}, "resource", "running_pods", "", "")`,
    `  or label_replace(${KubeNodeStatusCondition.name}{${labels}, condition="Ready", status="true"}, "resource", "ready", "", "")`,
    `  or label_replace(${KubeNodeCreated.name}{${labels}}, "resource", "created", "", "")`,
    ')',
    '* on(node, cluster_id) group_left(nodepool, label_node_kubernetes_io_instance_type, zone)',
    `  ${nodeLabelsFilter}`,
  ].join(' ');
}

function parseResponse(data: MimirQueryResponse | undefined): NodePoolNode[] {
  if (!data?.data?.result?.length) return [];

  // Group by node name
  const nodeMap = new Map<
    string,
    {
      instanceType?: string;
      zone?: string;
      ready: boolean;
      cpuAllocatable?: number;
      memoryAllocatable?: number;
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
      });
    }

    const entry = nodeMap.get(node)!;
    const value = parseFloat(sample.value[1]);
    const resource = sample.metric.resource;

    switch (resource) {
      case 'cpu':
        entry.cpuAllocatable = value;
        break;
      case 'memory':
        entry.memoryAllocatable = value;
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
    }
  }

  return Array.from(nodeMap.entries()).map(([node, entry]) => ({
    node,
    instanceType: entry.instanceType,
    zone: entry.zone,
    ready: entry.ready,
    cpuAllocatable: entry.cpuAllocatable,
    memoryAllocatable: entry.memoryAllocatable,
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
