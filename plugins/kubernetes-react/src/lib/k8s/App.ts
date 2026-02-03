import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type AppInterface = crds.giantswarm.v1alpha1.App;

export class App extends KubeObject<AppInterface> {
  static readonly supportedVersions = ['v1alpha1'] as const;
  static readonly group = 'application.giantswarm.io';
  static readonly kind = 'App' as const;
  static readonly plural = 'apps';

  getStatus() {
    return this.jsonData.status;
  }

  getSpec() {
    return this.jsonData.spec;
  }

  getKubeConfig() {
    return this.jsonData.spec?.kubeConfig;
  }

  getCurrentVersion() {
    return this.jsonData.status?.version;
  }

  getVersion() {
    return this.jsonData.spec?.version;
  }

  getCatalogName() {
    return this.jsonData.spec?.catalog;
  }
}
