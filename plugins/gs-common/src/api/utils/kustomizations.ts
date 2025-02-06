import * as fluxcd from '../../model/fluxcd';
import { Kustomization } from '../types';

export function getKustomizationNames() {
  return fluxcd.KustomizationNames;
}

export function getKustomizationKind() {
  return fluxcd.KustomizationKind;
}

export function getKustomizationGVK(apiVersion?: string) {
  const gvk = fluxcd.getKustomizationGVK(apiVersion);
  const kind = fluxcd.KustomizationKind;

  if (!gvk) {
    throw new Error(
      `${apiVersion} API version is not supported for ${kind} resource.`,
    );
  }

  return gvk;
}

export function getKustomizationPath(kustomization: Kustomization) {
  return kustomization.spec?.path;
}

export function getKustomizationSourceRef(kustomization: Kustomization) {
  const sourceRef = kustomization.spec?.sourceRef;
  if (!sourceRef) {
    return undefined;
  }

  const { apiVersion, kind, name, namespace } = sourceRef;

  if (!kind || !name) {
    throw new Error('Kind or name is missing in source reference.');
  }

  return {
    apiVersion,
    kind,
    name,
    namespace: namespace ?? 'default',
  };
}
