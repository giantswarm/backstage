import { Labels } from '@giantswarm/backstage-plugin-gs-common';
import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';

export function getKustomizationName(object: KubeObject) {
  const labels = object.getLabels();

  return labels?.[Labels.labelKustomizationName];
}

export function getKustomizationNamespace(object: KubeObject) {
  const labels = object.getLabels();

  return labels?.[Labels.labelKustomizationNamespace];
}

export function isManagedByFlux(object: KubeObject) {
  return (
    Boolean(getKustomizationName(object)) &&
    Boolean(getKustomizationNamespace(object))
  );
}
