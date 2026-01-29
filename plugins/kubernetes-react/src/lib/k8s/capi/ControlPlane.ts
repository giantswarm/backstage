import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type ControlPlaneV1Beta1 = crds.capi.v1beta1.KubeadmControlPlane;
type ControlPlaneV1Beta2 = crds.capi.v1beta2.KubeadmControlPlane;
type ControlPlaneInterface = ControlPlaneV1Beta1 | ControlPlaneV1Beta2;

export class ControlPlane extends KubeObject<ControlPlaneInterface> {
  static readonly supportedVersions = ['v1beta1', 'v1beta2'] as const;
  static readonly group = 'controlplane.cluster.x-k8s.io';
  static readonly kind = 'KubeadmControlPlane' as const;
  static readonly plural = 'kubeadmcontrolplanes';

  /**
   * Type guard to check if this control plane is v1beta1.
   */
  isV1Beta1(): this is ControlPlane & { jsonData: ControlPlaneV1Beta1 } {
    return this.getApiVersionSuffix() === 'v1beta1';
  }

  /**
   * Type guard to check if this control plane is v1beta2.
   */
  isV1Beta2(): this is ControlPlane & { jsonData: ControlPlaneV1Beta2 } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }

  getK8sVersion() {
    return this.jsonData.spec?.version;
  }
}
