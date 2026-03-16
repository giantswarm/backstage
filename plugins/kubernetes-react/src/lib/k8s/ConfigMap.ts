import { KubeObject, KubeObjectInterface } from './KubeObject';

interface ConfigMapInterface extends KubeObjectInterface {
  data?: Record<string, string>;
}

export class ConfigMap extends KubeObject<ConfigMapInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'ConfigMap' as const;
  static readonly plural = 'configmaps';
  static readonly isCore = true;

  getData() {
    return this.jsonData.data;
  }
}
