import { KubeObject, KubeObjectInterface } from './KubeObject';
import { FluxResourceStatusMixin, FluxResource } from './FluxResourceMixin';
import { FluxResourceStatus } from './FluxResourceStatusManager';

export interface HelmRepositoryInterface extends KubeObjectInterface {
  spec?: {
    url: string;
    suspend?: boolean;
  };
  status?: {
    artifact?: {
      revision: string;
    };
    conditions?: {
      lastTransitionTime: string;
      message: string;
      observedGeneration?: number;
      reason: string;
      status: 'True' | 'False' | 'Unknown';
      type: string;
    }[];
  };
}

export class HelmRepository
  extends KubeObject<HelmRepositoryInterface>
  implements FluxResource
{
  static apiVersion = 'v1beta2';
  static group = 'source.toolkit.fluxcd.io';
  static kind = 'HelmRepository' as const;
  static plural = 'helmrepositories';

  constructor(json: HelmRepositoryInterface, cluster: string) {
    super(json, cluster);
    // Update status in global manager when resource is created
    this.updateFluxStatus();
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  getURL() {
    return this.jsonData.spec?.url;
  }

  getRevision() {
    return this.jsonData.status?.artifact?.revision;
  }

  findReadyCondition() {
    const conditions = this.getStatusConditions();
    if (!conditions) {
      return undefined;
    }

    return conditions.find(c => c.type === 'Ready');
  }

  isReconciling() {
    const readyCondition = this.findReadyCondition();

    return (
      readyCondition?.status === 'Unknown' &&
      readyCondition?.reason === 'Progressing'
    );
  }

  isSuspended() {
    return Boolean(this.jsonData.spec?.suspend);
  }

  /**
   * Update status in the global status manager
   */
  updateFluxStatus(): FluxResourceStatus {
    return FluxResourceStatusMixin.updateResourceStatus(this);
  }

  /**
   * Get current status from the global status manager
   */
  getFluxStatus(): FluxResourceStatus | null {
    return FluxResourceStatusMixin.getResourceStatus(this);
  }

  /**
   * Get or calculate current status
   */
  getOrCalculateFluxStatus(): FluxResourceStatus {
    return FluxResourceStatusMixin.getOrCalculateStatus(this);
  }
}
