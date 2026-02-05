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
   *
   * ## New Resources: Use Latest Version Only
   *
   * For new resource classes, use only the latest available API version:
   *
   * ```typescript
   * type MyResourceInterface = crds.mygroup.v1.MyResource;
   *
   * export class MyResource extends KubeObject<MyResourceInterface> {
   *   static readonly supportedVersions = ['v1'] as const;
   *   // ...
   * }
   * ```
   *
   * ## Multi-Version Resources
   *
   * When backward compatibility requires multiple API versions, use the
   * version map pattern with `satisfies` for compile-time enforcement:
   *
   * ```typescript
   * // 1. Define version-specific types (only versions in @giantswarm/k8s-types)
   * type MyResourceV1Beta1 = crds.mygroup.v1beta1.MyResource;
   * type MyResourceV1Beta2 = crds.mygroup.v1beta2.MyResource;
   *
   * // 2. Version map (source of truth)
   * type MyResourceVersions = {
   *   'v1beta1': MyResourceV1Beta1;
   *   'v1beta2': MyResourceV1Beta2;
   * };
   *
   * // 3. Interface is union
   * type MyResourceInterface = MyResourceVersions[keyof MyResourceVersions];
   *
   * export class MyResource extends KubeObject<MyResourceInterface> {
   *   // 4. satisfies provides compile-time enforcement
   *   static readonly supportedVersions = ['v1beta1', 'v1beta2'] as const
   *     satisfies readonly (keyof MyResourceVersions)[];
   *
   *   // 5. REQUIRED: Type guards for each supported version
   *   isV1Beta1(): this is MyResource & { jsonData: MyResourceV1Beta1 } {
   *     return this.getApiVersionSuffix() === 'v1beta1';
   *   }
   *   isV1Beta2(): this is MyResource & { jsonData: MyResourceV1Beta2 } {
   *     return this.getApiVersionSuffix() === 'v1beta2';
   *   }
   * }
   * ```
   *
   * See `capi/Cluster.ts` for a reference implementation.
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
