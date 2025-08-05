/**
 * TypeScript implementation of Flux inventory parsing
 * Based on the Go implementation in fluxcd/cli-utils
 */

import { Kustomization } from '@giantswarm/backstage-plugin-kubernetes-react';

export interface ObjectMetadata {
  group: string;
  kind: string;
  namespace: string;
  name: string;
}

export interface InventoryEntry {
  id: string;
  v?: string; // Version (optional)
}

/**
 * Set of RBAC resources that require special colon handling
 */
const RBAC_GROUP_KINDS = new Set([
  'rbac.authorization.k8s.io/Role',
  'rbac.authorization.k8s.io/ClusterRole',
  'rbac.authorization.k8s.io/RoleBinding',
  'rbac.authorization.k8s.io/ClusterRoleBinding',
]);

/**
 * Parses an object metadata string from Flux inventory format.
 *
 * Format: namespace_name_group_kind
 *
 * Examples:
 * - "test-namespace_test-name_apps_Deployment"
 * - "_test-name_apps_ReplicaSet" (cluster-scoped, empty namespace)
 * - "test-namespace_kubeadm__nodes-kubeadm-config_rbac.authorization.k8s.io_Role" (RBAC with colon)
 *
 * @param inventoryId The inventory ID string to parse
 * @returns Parsed ObjectMetadata or throws an error if parsing fails
 */
export function parseObjectMetadata(inventoryId: string): ObjectMetadata {
  const fieldSeparator = '_';
  const colonTranscoded = '__';

  if (!inventoryId) {
    throw new Error('Inventory ID cannot be empty');
  }

  // Parse first field: namespace
  let index = inventoryId.indexOf(fieldSeparator);
  if (index === -1) {
    throw new Error(`Unable to parse stored object metadata: ${inventoryId}`);
  }

  const namespace = inventoryId.substring(0, index);
  let remaining = inventoryId.substring(index + 1);

  // Parse last field: kind
  index = remaining.lastIndexOf(fieldSeparator);
  if (index === -1) {
    throw new Error(`Unable to parse stored object metadata: ${inventoryId}`);
  }

  const kind = remaining.substring(index + 1);
  remaining = remaining.substring(0, index);

  // Parse next to last field: group
  index = remaining.lastIndexOf(fieldSeparator);
  if (index === -1) {
    throw new Error(`Unable to parse stored object metadata: ${inventoryId}`);
  }

  const group = remaining.substring(index + 1);
  let name = remaining.substring(0, index);

  // Decode colons from double underscores (for RBAC resources)
  name = name.replace(new RegExp(colonTranscoded, 'g'), ':');

  // Check for extra fields
  if (name.includes(fieldSeparator)) {
    throw new Error(`Too many fields within: ${inventoryId}`);
  }

  return {
    group,
    kind,
    namespace,
    name,
  };
}

/**
 * Parses all inventory entries from a Kustomization status
 *
 * @param inventoryEntries Array of inventory entries from kustomization.status.inventory.entries
 * @returns Array of parsed ObjectMetadata
 */
export function parseInventoryEntries(
  kustomization: Kustomization,
  inventoryEntries: InventoryEntry[],
): ObjectMetadata[] {
  if (!inventoryEntries || inventoryEntries.length === 0) {
    return [];
  }

  return inventoryEntries
    .map(entry => parseObjectMetadata(entry.id))
    .filter(
      ({ group, kind, namespace, name }) =>
        !(
          kustomization.getGroup() === group &&
          kustomization.getKind() === kind &&
          kustomization.getNamespace() === namespace &&
          kustomization.getName() === name
        ),
    );
}

/**
 * Formats an ObjectMetadata back to the inventory string format
 *
 * @param objMetadata The object metadata to format
 * @returns Formatted inventory string
 */
export function formatObjectMetadata(objMetadata: ObjectMetadata): string {
  const fieldSeparator = '_';
  const colonTranscoded = '__';

  let name = objMetadata.name;

  // Encode colons as double underscores for RBAC resources
  const groupKindKey = `${objMetadata.group}/${objMetadata.kind}`;
  if (RBAC_GROUP_KINDS.has(groupKindKey)) {
    name = name.replace(/:/g, colonTranscoded);
  }

  return `${objMetadata.namespace}${fieldSeparator}${name}${fieldSeparator}${objMetadata.group}${fieldSeparator}${objMetadata.kind}`;
}

/**
 * Groups parsed inventory entries by their type
 *
 * @param entries Array of parsed ObjectMetadata
 * @returns Object with entries grouped by kind
 */
export function groupInventoryByKind(
  entries: ObjectMetadata[],
): Record<string, ObjectMetadata[]> {
  return entries.reduce(
    (groups, entry) => {
      const kind = entry.kind;
      if (!groups[kind]) {
        groups[kind] = [];
      }
      groups[kind].push(entry);
      return groups;
    },
    {} as Record<string, ObjectMetadata[]>,
  );
}

/**
 * Filters inventory entries by namespace
 *
 * @param entries Array of parsed ObjectMetadata
 * @param namespace Namespace to filter by (empty string for cluster-scoped)
 * @returns Filtered array of ObjectMetadata
 */
export function filterInventoryByNamespace(
  entries: ObjectMetadata[],
  namespace: string,
): ObjectMetadata[] {
  return entries.filter(entry => entry.namespace === namespace);
}

/**
 * Checks if an object is cluster-scoped (has empty namespace)
 *
 * @param objMetadata The object metadata to check
 * @returns True if cluster-scoped, false if namespaced
 */
export function isClusterScoped(objMetadata: ObjectMetadata): boolean {
  return objMetadata.namespace === '';
}
