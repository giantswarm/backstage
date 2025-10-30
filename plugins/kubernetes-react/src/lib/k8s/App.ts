import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type AppInterface = crds.giantswarm.v1alpha1.App;

export class App extends KubeObject<AppInterface> {
  static apiVersion = 'v1alpha1';
  static group = 'application.giantswarm.io';
  static kind = 'App' as const;
  static plural = 'apps';

  getStatus() {
    return this.jsonData.status;
  }

  getChartName() {
    return this.jsonData.spec?.name;
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
