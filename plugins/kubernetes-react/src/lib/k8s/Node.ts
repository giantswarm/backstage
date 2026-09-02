import { KubeObject, KubeObjectInterface } from './KubeObject';
import { parseIntegerQuantity, parseMemoryQuantity } from './quantity';

/** A `status.conditions` entry as the kubelet writes it. */
export type NodeCondition = {
  type: string;
  status: 'True' | 'False' | 'Unknown' | string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
};

export interface NodeInterface extends KubeObjectInterface {
  spec?: {
    unschedulable?: boolean;
    taints?: { key: string; value?: string; effect: string }[];
  };
  status?: {
    capacity?: Record<string, string>;
    allocatable?: Record<string, string>;
    conditions?: NodeCondition[];
    nodeInfo?: {
      architecture?: string;
      kubeletVersion?: string;
      operatingSystem?: string;
      osImage?: string;
    };
  };
}

/**
 * A cluster node. Read for hardware capacity: what the kubelet advertises
 * (`status.capacity` / `status.allocatable`, incl. device-plugin extended
 * resources such as `nvidia.com/gpu`) and what node-feature/gpu-feature
 * discovery labels say about the hardware.
 */
export class Node extends KubeObject<NodeInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'Node' as const;
  static readonly plural = 'nodes';
  static readonly isCore = true;

  getCapacity() {
    return this.jsonData.status?.capacity;
  }

  getAllocatable() {
    return this.jsonData.status?.allocatable;
  }

  /**
   * The advertised capacity of one whole-number resource, e.g.
   * `nvidia.com/gpu`. `undefined` when the node does not advertise it at all —
   * for a device-plugin resource that means no plugin is running there.
   */
  getCapacityOf(resource: string): number | undefined {
    return parseIntegerQuantity(this.getCapacity()?.[resource]);
  }

  /** As {@link getCapacityOf}, for the schedulable (`allocatable`) amount. */
  getAllocatableOf(resource: string): number | undefined {
    return parseIntegerQuantity(this.getAllocatable()?.[resource]);
  }

  /**
   * Memory the scheduler may hand to pods on this node
   * (`status.allocatable.memory`), in bytes. The budget a memory fit check
   * compares against on a node whose GPU shares system memory; `undefined`
   * when the kubelet has not reported it.
   */
  getAllocatableMemoryBytes(): number | undefined {
    return parseMemoryQuantity(this.getAllocatable()?.memory);
  }

  getConditions() {
    return this.jsonData.status?.conditions;
  }

  isReady(): boolean {
    return (
      this.getConditions()?.find(condition => condition.type === 'Ready')
        ?.status === 'True'
    );
  }

  isSchedulable(): boolean {
    return this.jsonData.spec?.unschedulable !== true;
  }
}
