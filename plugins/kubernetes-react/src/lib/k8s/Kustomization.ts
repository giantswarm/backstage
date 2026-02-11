import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type KustomizationInterface = crds.fluxcd.v1.Kustomization;

export class Kustomization extends FluxObject<KustomizationInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'kustomize.toolkit.fluxcd.io';
  static readonly kind = 'Kustomization' as const;
  static readonly plural = 'kustomizations';

  getInventory() {
    return this.jsonData.status?.inventory;
  }

  getDependsOn() {
    return this.jsonData.spec?.dependsOn;
  }

  getKubeConfig() {
    return this.jsonData.spec?.kubeConfig;
  }

  getPath() {
    return this.jsonData.spec?.path;
  }

  getInterval() {
    return this.jsonData.spec?.interval;
  }

  getTimeout() {
    return this.jsonData.spec?.timeout;
  }

  getForce() {
    return this.jsonData.spec?.force;
  }

  getPrune() {
    return this.jsonData.spec?.prune;
  }

  getSourceRef() {
    const sourceRef = this.jsonData.spec?.sourceRef;
    if (!sourceRef) {
      return undefined;
    }

    return {
      ...sourceRef,
      namespace: sourceRef.namespace ?? this.getNamespace(),
    };
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
  }
}
