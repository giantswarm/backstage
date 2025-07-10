import { KubeObject, KubeObjectInterface } from './KubeObject';

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
    lastAppliedOriginRevision?: string;
    lastAppliedRevision?: string;
    lastAttemptedRevision?: string;
    lastHandledReconcileAt?: string;
    observedGeneration?: number;
  };
}

export class Kustomization extends KubeObject<KustomizationInterface> {
  static apiVersion = 'v1';
  static group = 'kustomize.toolkit.fluxcd.io';
  static kind = 'Kustomization' as const;
  static plural = 'kustomizations';

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

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  findStatusCondition() {
    const conditions = this.getStatusConditions();
    if (!conditions) {
      return undefined;
    }

    return conditions.find(c => c.type === 'Ready');
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
  }
}
