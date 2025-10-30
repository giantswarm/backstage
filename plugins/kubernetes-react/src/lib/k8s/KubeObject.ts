import { core } from '@giantswarm/k8s-types';

export interface KubeObjectInterface {
  kind: string;
  apiVersion: string;
  metadata: core.metav1.ObjectMeta;
  spec?: any;
  status?: any;
}

export class KubeObject<T extends KubeObjectInterface = any> {
  jsonData: T;
  cluster: string;

  static readonly apiVersion: string;
  static readonly group: string;
  static readonly plural: string;
  static readonly isCore: boolean = false;

  constructor(json: T, cluster: string) {
    this.jsonData = json;
    this.cluster = cluster;
  }

  getApiVersion() {
    return this.jsonData.apiVersion;
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
    return this.jsonData.metadata.name ?? '';
  }

  getNamespace() {
    return this.jsonData.metadata.namespace;
  }

  getLabels() {
    return this.jsonData.metadata.labels;
  }

  getAnnotations() {
    return this.jsonData.metadata.annotations;
  }

  getCreatedTimestamp() {
    return this.jsonData.metadata.creationTimestamp;
  }

  findLabel(label: string) {
    return this.jsonData.metadata.labels?.[label];
  }

  static getGVK() {
    return {
      apiVersion: this.apiVersion,
      group: this.group,
      plural: this.plural,
      isCore: this.isCore,
    };
  }
}
