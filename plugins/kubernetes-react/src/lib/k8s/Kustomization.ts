import { FluxObject, FluxObjectInterface } from './FluxObject';

export interface KustomizationInterface extends FluxObjectInterface {
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

export class Kustomization extends FluxObject<KustomizationInterface> {
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

  getSourceRef() {
    return this.jsonData.spec?.sourceRef;
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
  }
}
