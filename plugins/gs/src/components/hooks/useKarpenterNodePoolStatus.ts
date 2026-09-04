import { useMemo } from 'react';
import { useMimirQuery } from './useMimirQuery';
import {
  KarpenterNodePoolsAllowedDisruptions,
  KarpenterNodePoolsLimit,
  KarpenterNodePoolsUsage,
  KarpenterNodesAllocatable,
} from '../../apis/mimir/metrics';
import { MimirQueryResponse } from '../../apis/mimir/types';
import { sanitizePromQLValue } from './promql';

/** One bucket of a node distribution, e.g. `{ value: 'spot', count: 14 }`. */
export interface MixEntry {
  value: string;
  count: number;
}

export interface KarpenterNodePoolStatus {
  /** Nodes currently provisioned, or `undefined` when unknown. */
  totalNodes: number | undefined;
  /**
   * Distribution across a dimension, or `undefined` when the underlying label
   * is absent for every node — which must render as "omitted", never as zero.
   */
  capacityTypes: MixEntry[] | undefined;
  architectures: MixEntry[] | undefined;
  instanceFamilies: MixEntry[] | undefined;
  instanceTypes: MixEntry[] | undefined;
  zones: MixEntry[] | undefined;
  /** Provisioning ceilings by resource, from the NodePool's `limits`. */
  limits: Record<string, number>;
  /** Currently provisioned amounts by resource. */
  usage: Record<string, number>;
  /** Nodes disruptable right now, after the disruption budgets. */
  allowedDisruptions: number | undefined;
}

const REFETCH_INTERVAL = 30_000;

/** Bucket for nodes that do not carry the label being aggregated. */
export const UNKNOWN_MIX_VALUE = 'unknown';

const SERIES_LABEL = 'series';
const NODE_MIX = 'node_mix';
const LIMIT = 'limit';
const USAGE = 'usage';
const ALLOWED_DISRUPTIONS = 'allowed_disruptions';

/**
 * One instant query covering the running node distribution, the pool's
 * limits and usage, and its current disruption headroom.
 *
 * Each branch is tagged with a synthetic `series` label so a single response
 * can be pivoted apart, the same approach `useMimirNodePoolNodes` takes with
 * its `resource` label.
 *
 * `karpenter_nodes_allocatable` emits one series per resource per node, so the
 * distribution pins `resource_type="cpu"` to count each node exactly once.
 */
export function buildQuery(clusterName: string, nodePoolName: string): string {
  const l = `cluster_id="${sanitizePromQLValue(clusterName)}", nodepool="${sanitizePromQLValue(nodePoolName)}"`;
  const mixBy = 'capacity_type, arch, instance_family, instance_type, zone';

  return [
    '(',
    `  label_replace(count by (${mixBy}) (${KarpenterNodesAllocatable.name}{${l}, resource_type="cpu"}), "${SERIES_LABEL}", "${NODE_MIX}", "", "")`,
    `  or label_replace(max by (resource_type) (${KarpenterNodePoolsLimit.name}{${l}}), "${SERIES_LABEL}", "${LIMIT}", "", "")`,
    `  or label_replace(max by (resource_type) (${KarpenterNodePoolsUsage.name}{${l}}), "${SERIES_LABEL}", "${USAGE}", "", "")`,
    `  or label_replace(max (${KarpenterNodePoolsAllowedDisruptions.name}{${l}}), "${SERIES_LABEL}", "${ALLOWED_DISRUPTIONS}", "", "")`,
    ')',
  ].join(' ');
}

type Bucket = { counts: Map<string, number>; seen: boolean };

function newBucket(): Bucket {
  return { counts: new Map(), seen: false };
}

function addToBucket(bucket: Bucket, value: string | undefined, count: number) {
  if (value === undefined || value === '') {
    bucket.counts.set(
      UNKNOWN_MIX_VALUE,
      (bucket.counts.get(UNKNOWN_MIX_VALUE) ?? 0) + count,
    );
    return;
  }

  bucket.seen = true;
  bucket.counts.set(value, (bucket.counts.get(value) ?? 0) + count);
}

/**
 * `undefined` when the label was never present, so the caller omits the row
 * rather than claiming every node is "unknown".
 */
function toMix(bucket: Bucket): MixEntry[] | undefined {
  if (!bucket.seen) {
    return undefined;
  }

  return Array.from(bucket.counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function parseResponse(
  data: MimirQueryResponse | undefined,
): KarpenterNodePoolStatus | undefined {
  if (!data?.data?.result?.length) {
    return undefined;
  }

  const capacityTypes = newBucket();
  const architectures = newBucket();
  const instanceFamilies = newBucket();
  const instanceTypes = newBucket();
  const zones = newBucket();

  const limits: Record<string, number> = {};
  const usage: Record<string, number> = {};

  let nodeMixTotal = 0;
  let sawNodeMix = false;
  let allowedDisruptions: number | undefined;

  for (const sample of data.data.result) {
    const value = parseFloat(sample.value[1]);
    if (Number.isNaN(value)) {
      continue;
    }

    switch (sample.metric[SERIES_LABEL]) {
      case NODE_MIX: {
        sawNodeMix = true;
        nodeMixTotal += value;
        addToBucket(capacityTypes, sample.metric.capacity_type, value);
        addToBucket(architectures, sample.metric.arch, value);
        addToBucket(instanceFamilies, sample.metric.instance_family, value);
        addToBucket(instanceTypes, sample.metric.instance_type, value);
        addToBucket(zones, sample.metric.zone, value);
        break;
      }
      case LIMIT: {
        const resource = sample.metric.resource_type;
        if (resource) {
          limits[resource] = value;
        }
        break;
      }
      case USAGE: {
        const resource = sample.metric.resource_type;
        if (resource) {
          usage[resource] = value;
        }
        break;
      }
      case ALLOWED_DISRUPTIONS:
        allowedDisruptions = value;
        break;
      default:
        break;
    }
  }

  // Karpenter reports the node count directly; fall back to the distribution
  // when only the per-node series came back.
  const totalNodes = usage.nodes ?? (sawNodeMix ? nodeMixTotal : undefined);

  return {
    totalNodes,
    capacityTypes: toMix(capacityTypes),
    architectures: toMix(architectures),
    instanceFamilies: toMix(instanceFamilies),
    instanceTypes: toMix(instanceTypes),
    zones: toMix(zones),
    limits,
    usage,
    allowedDisruptions,
  };
}

/**
 * What a Karpenter node pool is actually running right now, as a companion to
 * the configuration on the `KarpenterMachinePool` CR.
 *
 * Only meaningful for Karpenter pools: these series are emitted by the
 * Karpenter controller, so `enabled` should be false for ASG and Azure pools.
 * Every field degrades to `undefined` rather than erroring, because the
 * configuration readout must not depend on metrics being available.
 */
export function useKarpenterNodePoolStatus(options: {
  installationName: string;
  clusterName: string;
  nodePoolName: string | null;
  enabled?: boolean;
}): {
  status: KarpenterNodePoolStatus | undefined;
  isLoading: boolean;
  error: Error | null;
  isAvailable: boolean | undefined;
} {
  const {
    installationName,
    clusterName,
    nodePoolName,
    enabled = true,
  } = options;

  const query = useMemo(
    () =>
      clusterName && nodePoolName ? buildQuery(clusterName, nodePoolName) : '',
    [clusterName, nodePoolName],
  );

  const { data, isLoading, error, isAvailable } = useMimirQuery({
    installationName,
    query,
    enabled: Boolean(enabled && clusterName && nodePoolName),
    refetchInterval: REFETCH_INTERVAL,
  });

  const status = useMemo(() => parseResponse(data), [data]);

  return { status, isLoading, error, isAvailable };
}
