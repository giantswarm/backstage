import * as capi from '../../model/capi';
import { ControlPlane } from '../types';

export function getControlPlaneNames(kind: string) {
  let names;
  switch (kind) {
    case capi.KubeadmControlPlaneKind:
      names = capi.KubeadmControlPlaneNames;
      break;
    default:
      throw new Error(`${kind} is not a supported control plane kind.`);
  }

  return names;
}

export function getControlPlaneGVK(kind: string, apiVersion?: string) {
  let gvk;
  switch (kind) {
    case capi.KubeadmControlPlaneKind:
      gvk = capi.getKubeadmControlPlaneGVK(apiVersion);
      break;
    default:
      throw new Error(`${kind} is not a supported control plane kind.`);
  }

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
