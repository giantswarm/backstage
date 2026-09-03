import { KubeObject, KubeObjectInterface } from './KubeObject';
import { sumResourceRequests } from './quantity';

export type PodContainer = {
  name: string;
  image?: string;
  resources?: {
    requests?: Record<string, string>;
    limits?: Record<string, string>;
  };
};

export interface PodInterface extends KubeObjectInterface {
  spec?: {
    nodeName?: string;
    containers?: PodContainer[];
    initContainers?: PodContainer[];
  };
  status?: {
    phase?: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown' | string;
    podIP?: string;
    startTime?: string;
    conditions?: {
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }[];
  };
}

/**
 * A pod, read for placement and resource accounting: which node it landed on,
 * whether it still occupies that node's resources, and how much of an extended
 * resource (e.g. `nvidia.com/gpu`) its containers request.
 */
export class Pod extends KubeObject<PodInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'Pod' as const;
  static readonly plural = 'pods';
  static readonly isCore = true;

  getNodeName() {
    return this.jsonData.spec?.nodeName;
  }

  getPhase() {
    return this.jsonData.status?.phase;
  }

  /**
   * Whether the pod has finished and no longer holds its node's resources. The
   * scheduler frees a `Succeeded`/`Failed` pod's requests, so capacity math
   * must skip them; everything else — including `Pending` pods already bound
   * to a node — still counts.
   */
  isTerminal(): boolean {
    const phase = this.getPhase();
    return phase === 'Succeeded' || phase === 'Failed';
  }

  /**
   * Total of one whole-number resource requested by the pod's regular
   * containers (limit standing in where a container declares only that, as the
   * scheduler does). `undefined` when no container declares the resource.
   * Init containers are left out: they run before the main containers and do
   * not add to the pod's steady-state footprint.
   */
  getResourceRequest(resource: string): number | undefined {
    return sumResourceRequests(
      (this.jsonData.spec?.containers ?? []).map(
        container => container.resources,
      ),
      resource,
    );
  }
}
