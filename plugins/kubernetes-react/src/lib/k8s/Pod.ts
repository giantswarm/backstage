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

/** A container's state as the kubelet reports it (`status.containerStatuses[]`). */
export type PodContainerStatus = {
  name: string;
  state?: {
    waiting?: { reason?: string; message?: string };
    running?: { startedAt?: string };
    terminated?: { reason?: string; message?: string; exitCode?: number };
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
    /** The pod's own word on its state, e.g. `Evicted`. */
    reason?: string;
    message?: string;
    conditions?: {
      type: string;
      status: string;
      reason?: string;
      message?: string;
    }[];
    initContainerStatuses?: PodContainerStatus[];
    containerStatuses?: PodContainerStatus[];
  };
}

/**
 * Why a `Pending` pod waits, in the kubelet's or the scheduler's words:
 * `reason` the short token (`Unschedulable`, `ImagePullBackOff`), `message`
 * the text behind it (the nodes the scheduler looked at, the pull error).
 */
export type PodPendingState = { reason?: string; message?: string };

function pendingState(
  reason: string | undefined,
  message: string | undefined,
): PodPendingState | undefined {
  return reason || message
    ? { reason: reason || undefined, message: message || undefined }
    : undefined;
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
   * Why a `Pending` pod is pending: the first container — init containers
   * first — waiting with a reason (`ImagePullBackOff`,
   * `CreateContainerConfigError`, `ContainerCreating`), else the
   * `PodScheduled=False` condition's (`Unschedulable`, with the nodes the
   * scheduler looked at as its message), else the pod's own status reason.
   * `undefined` for a pod in any other phase, and for a Pending one that has
   * nothing to say yet.
   */
  getPendingState(): PodPendingState | undefined {
    const status = this.jsonData.status;
    if (status?.phase !== 'Pending') {
      return undefined;
    }
    for (const container of [
      ...(status.initContainerStatuses ?? []),
      ...(status.containerStatuses ?? []),
    ]) {
      const waiting = container.state?.waiting;
      if (waiting?.reason) {
        return pendingState(waiting.reason, waiting.message);
      }
    }
    const unscheduled = status.conditions?.find(
      condition =>
        condition.type === 'PodScheduled' && condition.status === 'False',
    );
    if (unscheduled) {
      return pendingState(unscheduled.reason, unscheduled.message);
    }
    return pendingState(status.reason, status.message);
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
