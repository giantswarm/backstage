import * as capi from '../../model/capi';
import { ControlPlane } from '../types';

export {
  KubeadmControlPlaneKind,
  KubeadmControlPlaneNames,
} from '../../model/capi';

export function getKubeadmControlPlaneNames() {
  return capi.KubeadmControlPlaneNames;
}

export function getKubeadmControlPlaneGVK(apiVersion?: string) {
  const gvk = capi.getKubeadmControlPlaneGVK(apiVersion);
  const kind = capi.KubeadmControlPlaneKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getControlPlaneK8sVersion(controlPlane: ControlPlane) {
  return controlPlane.spec?.version;
}
