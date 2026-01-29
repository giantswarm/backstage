import { core } from '@giantswarm/k8s-types';
import { MultiVersionResourceMatcher } from './CustomResourceMatcher';

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

  /**
   * All API versions supported by this resource class.
   * Override in subclasses to support multiple versions.
   */
  static readonly supportedVersions: readonly string[] = [];

  /**
   * Backward compatibility getter.
   * Returns the latest (last) version from supportedVersions.
   */
  static get apiVersion(): string {
    return this.supportedVersions[this.supportedVersions.length - 1] ?? '';
  }

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

  /**
   * Extracts the version part from the apiVersion field.
   * For "cluster.x-k8s.io/v1beta1", returns "v1beta1".
   * For core resources like "v1", returns "v1".
   */
  getApiVersionSuffix(): string {
    const apiVersion = this.getApiVersion();
    const parts = apiVersion?.split('/');
    return parts?.length === 2 ? parts[1] : apiVersion;
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

  static getGVK(): MultiVersionResourceMatcher {
    return {
      apiVersion: this.apiVersion,
      group: this.group,
      plural: this.plural,
      isCore: this.isCore,
      supportedVersions: this.supportedVersions,
    };
  }
}
