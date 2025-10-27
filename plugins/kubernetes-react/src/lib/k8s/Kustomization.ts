import { crds } from '@giantswarm/k8s-types';
import { FluxObject } from './FluxObject';

type KustomizationInterface = crds.fluxcd.v1.Kustomization;

export class Kustomization extends FluxObject<KustomizationInterface> {
  static apiVersion = 'v1';
  static group = 'kustomize.toolkit.fluxcd.io';
  static kind = 'Kustomization' as const;
  static plural = 'kustomizations';

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

  getSourceRef() {
    return this.jsonData.spec?.sourceRef;
  }

  getLastAppliedRevision() {
    return this.jsonData.status?.lastAppliedRevision;
  }
}
