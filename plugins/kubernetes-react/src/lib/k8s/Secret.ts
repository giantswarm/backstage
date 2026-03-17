import { KubeObject, KubeObjectInterface } from './KubeObject';

interface SecretInterface extends KubeObjectInterface {
  data?: Record<string, string>;
  type?: string;
}

export class Secret extends KubeObject<SecretInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly kind = 'Secret' as const;
  static readonly plural = 'secrets';
  static readonly isCore = true;

  getData() {
    return this.jsonData.data;
  }

  getType() {
    return this.jsonData.type;
  }
}
