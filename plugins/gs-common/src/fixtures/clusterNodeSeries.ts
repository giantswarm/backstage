import {
  KarpenterNodePoolsAllowedDisruptions,
  KarpenterNodePoolsLimit,
  KarpenterNodePoolsUsage,
  KarpenterNodesAllocatable,
  KubeletRunningPods,
  KubeNodeCreated,
  KubeNodeLabels,
  KubeNodeStatusAllocatable,
  KubeNodeStatusCapacity,
  KubeNodeStatusCondition,
  KubePodContainerResourceRequests,
} from '../mimirMetrics';
import type { FixtureClusterNode } from './clusterBuilders';
import type { FixtureDataSet } from './dataSet';
import type { FixtureCounterSeries } from './gatewayUsage';

/** The node conditions kube-state-metrics reports besides Ready. */
const CONDITIONS = [
  'MemoryPressure',
  'DiskPressure',
  'PIDPressure',
  'NetworkUnavailable',
];

/** `m6i.xlarge` → `m6i`, as Karpenter labels a node's instance family. */
function familyOf(instanceType: string): string {
  return instanceType.split('.')[0];
}

/**
 * The node and Karpenter series of one installation's clusters, as Mimir
 * holds them: kube-state-metrics' and the kubelet's per node, with the
 * `nodepool` label on `kube_node_labels`, and Karpenter's per node and per
 * pool for the Karpenter pools. Gauges, each a single point from the time
 * its node or pool started, so an instant query at any later time reads it.
 */
export function clusterNodeSeriesOf(
  data: FixtureDataSet,
  installation: string,
): FixtureCounterSeries[] {
  const series: FixtureCounterSeries[] = [];
  const gauge = (
    labels: Record<string, string>,
    since: string,
    value: number,
  ) => series.push({ labels, points: [[Date.parse(since), value]] });

  for (const cluster of data.clusters) {
    if (cluster.installation !== installation) {
      continue;
    }
    const clusterId = { cluster_id: cluster.name };
    for (const pool of cluster.pools) {
      const nodeOf = (node: FixtureClusterNode) => ({
        ...clusterId,
        node: node.name,
      });
      for (const node of pool.nodes) {
        const at = node.createdAt;
        const labels = nodeOf(node);
        gauge(
          {
            __name__: KubeNodeLabels.name,
            ...labels,
            nodepool: pool.name,
            label_node_kubernetes_io_instance_type: node.instanceType,
            zone: node.zone,
          },
          at,
          1,
        );
        for (const [resource, capacity, allocatable] of [
          ['cpu', node.cpuCapacity, node.cpuAllocatable],
          ['memory', node.memoryCapacity, node.memoryAllocatable],
          ['pods', node.podsAllocatable, node.podsAllocatable],
        ] as const) {
          gauge(
            { __name__: KubeNodeStatusCapacity.name, ...labels, resource },
            at,
            capacity,
          );
          gauge(
            { __name__: KubeNodeStatusAllocatable.name, ...labels, resource },
            at,
            allocatable,
          );
        }
        // The requests of the node's pods, as one container's.
        for (const [resource, requests] of [
          ['cpu', node.cpuRequests],
          ['memory', node.memoryRequests],
        ] as const) {
          gauge(
            {
              __name__: KubePodContainerResourceRequests.name,
              ...labels,
              namespace: 'kube-system',
              pod: `workload-${node.name.split('.')[0]}`,
              container: 'main',
              resource,
            },
            at,
            requests,
          );
        }
        gauge(
          { __name__: KubeletRunningPods.name, ...labels },
          at,
          node.runningPods,
        );
        for (const condition of ['Ready', ...CONDITIONS]) {
          const isTrue =
            condition === 'Ready'
              ? node.ready
              : node.conditions.includes(condition);
          for (const status of ['true', 'false']) {
            gauge(
              {
                __name__: KubeNodeStatusCondition.name,
                ...labels,
                condition,
                status,
              },
              at,
              (status === 'true') === isTrue ? 1 : 0,
            );
          }
        }
        gauge(
          { __name__: KubeNodeCreated.name, ...labels },
          at,
          Date.parse(at) / 1000,
        );
        if (pool.kind === 'karpenter') {
          for (const [resourceType, value] of [
            ['cpu', node.cpuAllocatable],
            ['memory', node.memoryAllocatable],
            ['pods', node.podsAllocatable],
          ] as const) {
            gauge(
              {
                __name__: KarpenterNodesAllocatable.name,
                ...labels,
                nodepool: pool.name,
                resource_type: resourceType,
                capacity_type: node.capacityType,
                arch: 'amd64',
                instance_family: familyOf(node.instanceType),
                instance_type: node.instanceType,
                zone: node.zone,
              },
              at,
              value,
            );
          }
        }
      }
      if (pool.kind === 'karpenter') {
        const poolLabels = { ...clusterId, nodepool: pool.name };
        const memoryLimit = Number.parseInt(pool.limits.memory, 10) * 1024 ** 3;
        gauge(
          {
            __name__: KarpenterNodePoolsLimit.name,
            ...poolLabels,
            resource_type: 'cpu',
          },
          pool.createdAt,
          pool.limits.cpu,
        );
        gauge(
          {
            __name__: KarpenterNodePoolsLimit.name,
            ...poolLabels,
            resource_type: 'memory',
          },
          pool.createdAt,
          memoryLimit,
        );
        for (const [resourceType, value] of [
          ['cpu', pool.nodes.reduce((sum, n) => sum + n.cpuCapacity, 0)],
          ['memory', pool.nodes.reduce((sum, n) => sum + n.memoryCapacity, 0)],
          ['nodes', pool.nodes.length],
        ] as const) {
          gauge(
            {
              __name__: KarpenterNodePoolsUsage.name,
              ...poolLabels,
              resource_type: resourceType,
            },
            pool.createdAt,
            value,
          );
        }
        gauge(
          {
            __name__: KarpenterNodePoolsAllowedDisruptions.name,
            ...poolLabels,
            reason: 'underutilized',
          },
          pool.createdAt,
          pool.allowedDisruptions,
        );
      }
    }
  }
  return series;
}

const built = new WeakMap<
  FixtureDataSet,
  Map<string, FixtureCounterSeries[]>
>();

/** {@link clusterNodeSeriesOf}, built once per data set and installation. */
export function clusterNodeSeries(
  data: FixtureDataSet,
  installation: string,
): FixtureCounterSeries[] {
  let byInstallation = built.get(data);
  if (!byInstallation) {
    byInstallation = new Map();
    built.set(data, byInstallation);
  }
  let series = byInstallation.get(installation);
  if (!series) {
    series = clusterNodeSeriesOf(data, installation);
    byInstallation.set(installation, series);
  }
  return series;
}
