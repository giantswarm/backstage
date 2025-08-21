import { KubeObject, KubeObjectInterface } from './KubeObject';
import { FluxResourceStatusMixin, FluxResource } from './FluxResourceMixin';
import { FluxResourceStatus } from './FluxResourceStatusManager';

export interface KustomizationInterface extends KubeObjectInterface {
  spec?: {
    dependsOn?: {
      name: string;
      namespace?: string;
    }[];
    kubeConfig?: {
      secretRef: {
        key?: string;
        name: string;
      };
    };
    path?: string;
    sourceRef: {
      apiVersion?: string;
      kind: 'OCIRepository' | 'GitRepository' | 'Bucket';
      name: string;
      namespace?: string;
    };
    suspend?: boolean;
  };
  status?: {
    conditions?: {
      lastTransitionTime: string;
      message: string;
      observedGeneration?: number;
      reason: string;
      status: 'True' | 'False' | 'Unknown';
      type: string;
    }[];
    inventory?: {
      entries: {
        id: string;
        v: string;
      }[];
    };
    lastAppliedRevision?: string;
    lastAttemptedRevision?: string;
  };
}

export class Kustomization
  extends KubeObject<KustomizationInterface>
  implements FluxResource
{
  static apiVersion = 'v1';
  static group = 'kustomize.toolkit.fluxcd.io';
  static kind = 'Kustomization' as const;
  static plural = 'kustomizations';

  constructor(json: KustomizationInterface, cluster: string) {
    super(json, cluster);
    // Update status in global manager when resource is created
    this.updateFluxStatus();
  }

  getInventory() {
    return this.jsonData.status?.inventory;
  }

  getDependsOn() {
    return this.jsonData.spec?.dependsOn;
  }

  getKubeConfig() {
    return this.jsonData.spec?.kubeConfig;
  }

  getPath() {
    return this.jsonData.spec?.path;
  }

  getSourceRef() {
    return this.jsonData.spec?.sourceRef;
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
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
