import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from '../KubeObject';

type ControlPlaneInterface = crds.capi.v1beta1.KubeadmControlPlane;

export class ControlPlane extends KubeObject<ControlPlaneInterface> {
  static apiVersion = 'v1beta1';
  static group = 'controlplane.cluster.x-k8s.io';
  static kind = 'KubeadmControlPlane' as const;
  static plural = 'kubeadmcontrolplanes';

  getK8sVersion() {
    return this.jsonData.spec?.version;
  }
}
