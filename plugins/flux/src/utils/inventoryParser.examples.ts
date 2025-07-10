/**
 * Example usage and demonstration of the Flux inventory parser
 *
 * This file shows how to use the TypeScript implementation of the Flux inventory parser
 * that is based on the Go implementation from fluxcd/cli-utils.
 */

import {
  parseObjectMetadata,
  parseInventoryEntries,
  groupInventoryByKind,
  filterInventoryByNamespace,
  isClusterScoped,
  type InventoryEntry,
} from './inventoryParser';

/**
 * Example demonstrating parsing a single inventory ID
 */
export function exampleParseID() {
  // Example from a real Flux deployment
  const inventoryId = 'flux-system_helm-controller_apps_Deployment';

  const parsed = parseObjectMetadata(inventoryId);
  // Result:
  // {
  //   namespace: 'flux-system',
  //   name: 'helm-controller',
  //   groupKind: { group: 'apps', kind: 'Deployment' }
  // }

  return parsed;
}

/**
 * Example demonstrating parsing RBAC resources with colons
 */
export function exampleParseRBACWithColons() {
  // RBAC resources encode colons as double underscores
  const rbacId =
    'flux-system_system____leader-locking-kube-scheduler_rbac.authorization.k8s.io_Role';

  const parsed = parseObjectMetadata(rbacId);
  // Result:
  // {
  //   namespace: 'flux-system',
  //   name: 'system::leader-locking-kube-scheduler',
  //   groupKind: { group: 'rbac.authorization.k8s.io', kind: 'Role' }
  // }

  return parsed;
}

/**
 * Example demonstrating parsing cluster-scoped resources
 */
export function exampleParseClusterScoped() {
  // Cluster-scoped resources have empty namespace (represented as underscore prefix)
  const clusterScopedId = '_flux-system_v1_Namespace';

  const parsed = parseObjectMetadata(clusterScopedId);
  // Result:
  // {
  //   namespace: '',
  //   name: 'flux-system',
  //   groupKind: { group: 'v1', kind: 'Namespace' }
  // }

  return parsed;
}

/**
 * Example demonstrating parsing a complete Flux kustomization inventory
 */
export function exampleParseFullInventory() {
  // Example inventory from a real Flux deployment
  const inventory: InventoryEntry[] = [
    { id: 'flux-system_helm-controller_apps_Deployment', v: 'v1' },
    { id: 'flux-system_kustomize-controller_apps_Deployment', v: 'v1' },
    { id: 'flux-system_notification-controller_apps_Deployment', v: 'v1' },
    { id: 'flux-system_source-controller_apps_Deployment', v: 'v1' },
    { id: '_flux-system_v1_Namespace', v: 'v1' },
    { id: 'flux-system_helm-controller_v1_ServiceAccount', v: 'v1' },
    { id: 'flux-system_kustomize-controller_v1_ServiceAccount', v: 'v1' },
    { id: '_helm-controller_rbac.authorization.k8s.io_ClusterRole', v: 'v1' },
    {
      id: '_flux-system__helm-controller_rbac.authorization.k8s.io_ClusterRoleBinding',
      v: 'v1',
    },
    { id: 'flux-system_webhook-receiver_v1_Service', v: 'v1' },
  ];

  // Parse all entries
  const parsed = parseInventoryEntries(inventory);

  // Group by resource kind
  const byKind = groupInventoryByKind(parsed);
  // Result:
  // {
  //   Deployment: [4 deployments],
  //   Namespace: [1 namespace],
  //   ServiceAccount: [2 service accounts],
  //   ClusterRole: [1 cluster role],
  //   ClusterRoleBinding: [1 cluster role binding],
  //   Service: [1 service]
  // }

  // Filter by namespace
  const fluxSystemResources = filterInventoryByNamespace(parsed, 'flux-system');
  const clusterScopedResources = parsed.filter(isClusterScoped);

  return {
    totalResources: parsed.length,
    byKind,
    fluxSystemCount: fluxSystemResources.length,
    clusterScopedCount: clusterScopedResources.length,
    parsed,
  };
}

/**
 * Example showing how to integrate with a Kustomization object
 */
export function exampleIntegrateWithKustomization(kustomization: any) {
  // Check if kustomization has inventory
  if (!kustomization.status?.inventory?.entries) {
    return {
      hasInventory: false,
      resources: [],
    };
  }

  try {
    // Parse the inventory entries
    const resources = parseInventoryEntries(
      kustomization.status.inventory.entries,
    );

    // Analyze the resources
    const analysis = {
      total: resources.length,
      byKind: groupInventoryByKind(resources),
      namespaces: Array.from(
        new Set(
          resources.filter(r => !isClusterScoped(r)).map(r => r.namespace),
        ),
      ),
      clusterScoped: resources.filter(isClusterScoped).length,
    };

    return {
      hasInventory: true,
      resources,
      analysis,
    };
  } catch (error) {
    return {
      hasInventory: true,
      resources: [],
      error: error instanceof Error ? error.message : 'Unknown parsing error',
    };
  }
}

/**
 * Example showing common use cases for analyzing Flux resources
 */
export function exampleCommonAnalysis(inventoryEntries: InventoryEntry[]) {
  const resources = parseInventoryEntries(inventoryEntries);

  return {
    // Total count
    totalResources: resources.length,

    // Breakdown by scope
    clusterScoped: resources.filter(isClusterScoped).length,
    namespaced: resources.filter(r => !isClusterScoped(r)).length,

    // Count by kind
    deployments: resources.filter(r => r.groupKind.kind === 'Deployment')
      .length,
    services: resources.filter(r => r.groupKind.kind === 'Service').length,
    configMaps: resources.filter(r => r.groupKind.kind === 'ConfigMap').length,
    secrets: resources.filter(r => r.groupKind.kind === 'Secret').length,
    rbacResources: resources.filter(
      r => r.groupKind.group === 'rbac.authorization.k8s.io',
    ).length,

    // Unique namespaces
    namespaces: Array.from(
      new Set(resources.filter(r => !isClusterScoped(r)).map(r => r.namespace)),
    ).sort(),

    // Resource names that might indicate system resources
    systemResources: resources.filter(
      r =>
        r.name.includes('controller') ||
        r.name.includes('operator') ||
        r.name.includes('system'),
    ).length,
  };
}

/**
 * Example showing error handling
 */
export function exampleErrorHandling() {
  const invalidInventoryIds = [
    '', // Empty string
    'invalid', // Too few fields
    'too_many_fields_here_extra_field', // Too many fields
    'namespace_name_group', // Missing kind field
  ];

  const results = invalidInventoryIds.map(id => {
    try {
      return {
        id,
        success: true,
        result: parseObjectMetadata(id),
      };
    } catch (error) {
      return {
        id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  return results;
}
