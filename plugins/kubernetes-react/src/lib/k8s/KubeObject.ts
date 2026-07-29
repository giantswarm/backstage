import { core } from '@giantswarm/k8s-types';
import {
  CustomResourceMatcher,
  MultiVersionResourceMatcher,
} from './CustomResourceMatcher';

export interface KubeObjectInterface {
  kind: string;
  apiVersion: string;
  metadata: core.metav1.ObjectMeta;
  spec?: any;
  status?: any;
}

/**
 * Whether a `managedFields` entry's `fieldsV1` set covers the given field path.
 *
 * `fieldsV1` prefixes every path segment with `f:`, so ownership of
 * `spec.suspend` is encoded as `{"f:spec":{"f:suspend":{}}}`.
 */
function ownsFieldPath(fieldsV1: unknown, path: string[]): boolean {
  let node = fieldsV1;

  for (let depth = 0; depth < path.length; depth++) {
    if (!node || typeof node !== 'object') {
      return false;
    }

    const fields = node as Record<string, unknown>;
    const key = `f:${path[depth]}`;

    if (key in fields) {
      node = fields[key];
      continue;
    }

    // A node we have descended into that lists no children is an atomic field:
    // the manager owns the whole subtree, including the path being asked about.
    // At the root, though, an empty set simply means the manager owns nothing.
    return depth > 0 && Object.keys(fields).length === 0;
  }

  return true;
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

  getManagedFields() {
    return this.jsonData.metadata.managedFields;
  }

  /**
   * The managers that *server-side apply* the given field, and will therefore
   * re-assert it on their next apply — reverting any imperative write we make.
   *
   * Only `Apply`-operation entries count, so this detects **SSA appliers only**.
   * That is narrower than "everything that could revert us": the two common
   * non-SSA declarative writers keep a stored desired state and re-assert it,
   * yet are both recorded as `operation: Update` and so are missed here.
   *
   * - client-side `kubectl apply` (`manager: kubectl-client-side-apply`) resends
   *   the whole manifest as a strategic-merge patch, which is why it undoes a
   *   `kubectl edit`;
   * - `helm upgrade` (and helm-controller's release writes) patch via a
   *   three-way merge that resets drift on chart-declared fields. Only
   *   helm-controller's separate drift-correction path uses SSA, i.e. when
   *   `spec.driftDetection` is enabled.
   *
   * So an empty result means "no SSA applier claims this field", not "nothing
   * will revert a write to it". Callers gating a write affordance on this should
   * treat it as a best-effort signal.
   *
   * Results are deduplicated: entries are keyed by manager + operation +
   * apiVersion + subresource, so one manager can legitimately hold several (e.g.
   * the same controller at two apiVersions after a CRD version migration).
   *
   * @param path field path from the object root, e.g. `['spec', 'suspend']`
   */
  getApplyFieldOwners(path: string[]): string[] {
    const managers = (this.getManagedFields() ?? [])
      .filter(
        entry =>
          entry.operation === 'Apply' && ownsFieldPath(entry.fieldsV1, path),
      )
      .map(entry => entry.manager)
      .filter((manager): manager is string => Boolean(manager));

    return [...new Set(managers)];
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

  /**
   * The matcher for the API version this specific object was actually read at,
   * as opposed to the class-level {@link getGVK}, which reports the latest
   * supported version.
   *
   * Reads resolve their version through API discovery (`usePreferredVersion`),
   * so writes and cache invalidations must use this — targeting the static
   * version can hit a version the cluster does not serve, and produces query
   * keys that do not match the ones the read hooks registered.
   */
  getResolvedGVK(): CustomResourceMatcher {
    const ctor = this.constructor as typeof KubeObject;

    return {
      apiVersion: this.getApiVersionSuffix(),
      // Core resources have no group. `getGroup()` splits `apiVersion` on '/',
      // so for a core object (`apiVersion: 'v1'`) it returns 'v1' rather than an
      // empty string — which would produce query keys the read hooks never
      // registered (they drop the empty group via `.filter(Boolean)`) and access
      // reviews asking about a group no authorizer knows.
      group: ctor.isCore ? '' : (this.getGroup() ?? ctor.group),
      plural: ctor.plural,
      isCore: ctor.isCore,
    };
  }
}
