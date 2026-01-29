import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type ClusterV1Beta1 = crds.capi.v1beta1.Cluster;
type ClusterV1Beta2 = crds.capi.v1beta2.Cluster;
type ClusterInterface = ClusterV1Beta1 | ClusterV1Beta2;

export class Cluster extends KubeObject<ClusterInterface> {
  static readonly supportedVersions = ['v1beta1', 'v1beta2'] as const;
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

  getInfrastructureRef():
    | {
        apiVersion?: string;
        apiGroup?: string;
        kind: string;
        name: string;
        namespace: string;
      }
    | undefined {
    const ref = this.jsonData.spec?.infrastructureRef;
    if (!ref || !ref.kind || !ref.name) {
      return undefined;
    }
    // v1beta2 uses TypedLocalObjectReference with apiGroup but without namespace,
    // v1beta1 uses ObjectReference with apiVersion and optional namespace.
    // When namespace is missing, use the parent's namespace.
    const refNamespace = 'namespace' in ref ? ref.namespace : undefined;
    return {
      apiVersion: 'apiVersion' in ref ? ref.apiVersion : undefined,
      apiGroup: 'apiGroup' in ref ? ref.apiGroup : undefined,
      kind: ref.kind,
      name: ref.name,
      namespace: refNamespace ?? this.getNamespace() ?? '',
    };
  }

  getControlPlaneRef():
    | {
        apiVersion?: string;
        apiGroup?: string;
        kind: string;
        name: string;
        namespace: string;
      }
    | undefined {
    const ref = this.jsonData.spec?.controlPlaneRef;
    if (!ref || !ref.kind || !ref.name) {
      return undefined;
    }
    // v1beta2 uses TypedLocalObjectReference with apiGroup but without namespace,
    // v1beta1 uses ObjectReference with apiVersion and optional namespace.
    // When namespace is missing, use the parent's namespace.
    const refNamespace = 'namespace' in ref ? ref.namespace : undefined;
    return {
      apiVersion: 'apiVersion' in ref ? ref.apiVersion : undefined,
      apiGroup: 'apiGroup' in ref ? ref.apiGroup : undefined,
      kind: ref.kind,
      name: ref.name,
      namespace: refNamespace ?? this.getNamespace() ?? '',
    };
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
