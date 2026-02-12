import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';

const LABEL_KUSTOMIZATION_NAME = 'kustomize.toolkit.fluxcd.io/name';
const LABEL_KUSTOMIZATION_NAMESPACE = 'kustomize.toolkit.fluxcd.io/namespace';

export function getKustomizationName(object: KubeObject) {
  const labels = object.getLabels();

  return labels?.[LABEL_KUSTOMIZATION_NAME];
}

export function getKustomizationNamespace(object: KubeObject) {
  const labels = object.getLabels();

  return labels?.[LABEL_KUSTOMIZATION_NAMESPACE];
}

export function isManagedByFlux(object: KubeObject) {
  return (
    Boolean(getKustomizationName(object)) &&
    Boolean(getKustomizationNamespace(object))
  );
}
