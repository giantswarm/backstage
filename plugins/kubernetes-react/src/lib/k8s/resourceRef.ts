/**
 * A typed reference from one resource to another, in either of the two shapes
 * Kubernetes uses for them.
 *
 * - `ObjectReference` (CAPI v1beta1) carries `apiVersion`, e.g.
 *   `controlplane.cluster.x-k8s.io/v1beta1`, or `v1` for a core resource.
 * - `TypedLocalObjectReference` (CAPI v1beta2) carries `apiGroup`, the group
 *   alone, e.g. `controlplane.cluster.x-k8s.io`; an empty `apiGroup` means
 *   the core group.
 *
 * A ref with neither field is unspecified and matches on kind alone.
 */
export interface ResourceRef {
  apiVersion?: string;
  apiGroup?: string;
  kind?: string;
}

/**
 * What a reference is matched against: a model class (its static `kind`,
 * `group` and latest `apiVersion`) or a fetched object (its own fields). Core
 * resources have an empty `group`.
 */
export interface ResourceIdentity {
  kind: string;
  group: string;
  apiVersion: string;
}

/**
 * Extracts the API group from an apiVersion string.
 * For "controlplane.cluster.x-k8s.io/v1beta1" returns "controlplane.cluster.x-k8s.io".
 * For core resources like "v1" returns undefined.
 */
export function getApiGroupFromVersion(
  apiVersion: string | undefined,
): string | undefined {
  if (!apiVersion) return undefined;
  const parts = apiVersion.split('/');
  return parts.length === 2 ? parts[0] : undefined;
}

/**
 * Whether a reference points at the given resource identity.
 *
 * The kind must match. The group is compared without its version, so a
 * v1beta1 reference still matches a resource read at v1beta2. An `apiGroup`
 * takes precedence over an `apiVersion`; an empty `apiGroup`, or an
 * `apiVersion` without a group part (`v1`, or a malformed value with no `/`),
 * means the core group and matches only a core resource — for those the
 * version is compared exactly. A reference with neither field is matched on
 * kind alone.
 */
export function refMatchesResource(
  ref: ResourceRef,
  target: ResourceIdentity,
): boolean {
  if (ref.kind !== target.kind) {
    return false;
  }

  if (ref.apiGroup !== undefined) {
    return ref.apiGroup === target.group;
  }

  if (ref.apiVersion !== undefined) {
    const refGroup = getApiGroupFromVersion(ref.apiVersion) ?? '';
    if (refGroup === '' && target.group === '') {
      return ref.apiVersion === target.apiVersion;
    }
    return refGroup === target.group;
  }

  return true;
}
