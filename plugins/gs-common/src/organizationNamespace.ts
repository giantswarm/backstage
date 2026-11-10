/**
 * The start of a Giant Swarm organization's namespace: the `Organization`
 * resource `<name>` owns the namespace `org-<name>`.
 */
export const ORGANIZATION_NAMESPACE_PREFIX = 'org-';

/**
 * The Giant Swarm organization a namespace names by that convention
 * (`org-marian` is `marian`), or `undefined` for any other namespace and for
 * the prefix alone.
 */
export function organizationNameOfNamespace(
  namespace: string,
): string | undefined {
  if (!namespace.startsWith(ORGANIZATION_NAMESPACE_PREFIX)) {
    return undefined;
  }
  return namespace.slice(ORGANIZATION_NAMESPACE_PREFIX.length) || undefined;
}
