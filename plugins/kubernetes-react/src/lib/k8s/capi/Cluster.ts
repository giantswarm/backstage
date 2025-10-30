import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type ClusterInterface = crds.capi.v1beta1.Cluster;

export class Cluster extends KubeObject<ClusterInterface> {
  static apiVersion = 'v1beta1';
  static group = 'cluster.x-k8s.io';
  static kind = 'Cluster' as const;
  static plural = 'clusters';

  getDeletionTimestamp() {
    return this.jsonData.metadata?.deletionTimestamp;
  }

  getInfrastructureRef() {
    const infrastructureRef = this.jsonData.spec?.infrastructureRef;
    if (!infrastructureRef) {
      return undefined;
    }

    const { kind, apiVersion, name, namespace } = infrastructureRef;

    if (!kind || !apiVersion || !name) {
      return undefined;
    }

    return { kind, apiVersion, name, namespace };
  }

  getControlPlaneRef() {
    const controlPlaneRef = this.jsonData.spec?.controlPlaneRef;
    if (!controlPlaneRef) {
      return undefined;
    }

    const { kind, apiVersion, name, namespace } = controlPlaneRef;

    if (!kind || !apiVersion || !name) {
      return undefined;
    }

    return { kind, apiVersion, name, namespace };
  }

  getControlPlaneEndpoint() {
    return this.jsonData.spec?.controlPlaneEndpoint;
  }

  getStatusConditions() {
    return this.jsonData.status?.conditions;
  }

  findControlPlaneInitializedCondition() {
    const conditions = this.getStatusConditions();
    if (!conditions) {
      return undefined;
    }

    return conditions.find(c => c.type === 'ControlPlaneInitialized');
  }
}
