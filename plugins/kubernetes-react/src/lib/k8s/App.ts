import { KubeObject, KubeObjectInterface } from './KubeObject';

export interface AppInterface extends KubeObjectInterface {
  spec?: {
    catalog: string;
    name: string;
    kubeConfig: {
      inCluster: boolean;
      secret?: {
        name: string;
        namespace: string;
      };
    };
    version: string;
  };
  status?: {
    release: {
      status: string;
      lastDeployed?: string;
    };
    version: string;
  };
}

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
