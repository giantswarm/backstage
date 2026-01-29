import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type ClusterV1Beta1 = crds.capi.v1beta1.Cluster;
type ClusterV1Beta2 = crds.capi.v1beta2.Cluster;
type ClusterInterface = ClusterV1Beta1 | ClusterV1Beta2;

export class Cluster extends KubeObject<ClusterInterface> {
  static readonly supportedVersions = ['v1beta1'] as const;
  static readonly group = 'cluster.x-k8s.io';
  static readonly kind = 'Cluster' as const;
  static readonly plural = 'clusters';

  /**
   * Type guard to check if this cluster is v1beta1.
   */
  isV1Beta1(): this is Cluster & { jsonData: ClusterV1Beta1 } {
    return this.getApiVersionSuffix() === 'v1beta1';
  }

  /**
   * Type guard to check if this cluster is v1beta2.
   */
  isV1Beta2(): this is Cluster & { jsonData: ClusterV1Beta2 } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

  getDeletionTimestamp() {
    return this.jsonData.metadata?.deletionTimestamp;
  }

  getInfrastructureRef() {
    return this.jsonData.spec?.infrastructureRef;
  }

  getControlPlaneRef() {
    return this.jsonData.spec?.controlPlaneRef;
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
