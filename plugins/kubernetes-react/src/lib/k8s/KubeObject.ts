import { KubeMetadata } from './KubeMetadata';

export interface KubeObjectInterface {
  kind: string;
  apiVersion?: string;
  metadata: KubeMetadata;
  spec?: any;
  status?: any;
}

export class KubeObject<T extends KubeObjectInterface = any> {
  jsonData: T;
  cluster: string;

  static readonly apiVersion: string;
  static readonly group: string;
  static readonly plural: string;

  constructor(json: T, cluster: string) {
    this.jsonData = json;
    this.cluster = cluster;
  }

  getGroup() {
    return this.jsonData.apiVersion
      ? this.jsonData.apiVersion.split('/')[0]
      : undefined;
  }

  getKind() {
    return this.jsonData.kind;
  }

  getName() {
    return this.jsonData.metadata.name;
  }

  getNamespace() {
    return this.jsonData.metadata.namespace;
  }

  static getGVK() {
    return {
      apiVersion: this.apiVersion,
      group: this.group,
      plural: this.plural,
    };
  }
}
