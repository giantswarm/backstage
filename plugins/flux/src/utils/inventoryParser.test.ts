import {
  parseObjectMetadata,
  parseInventoryEntries,
  formatObjectMetadata,
  groupInventoryByKind,
  filterInventoryByNamespace,
  isClusterScoped,
  type ObjectMetadata,
  type InventoryEntry,
} from './inventoryParser';

/**
 * Test cases based on the Go test examples from fluxcd/cli-utils
 */
describe('Flux Inventory Parser', () => {
  describe('parseObjectMetadata', () => {
    it('should parse basic inventory string', () => {
      const result = parseObjectMetadata(
        'test-namespace_test-name_apps_Deployment',
      );
      expect(result).toEqual({
        namespace: 'test-namespace',
        name: 'test-name',
        groupKind: {
          group: 'apps',
          kind: 'Deployment',
        },
      });
    });

    it('should parse inventory string with empty namespace (cluster-scoped)', () => {
      const result = parseObjectMetadata('_test-name_apps_ReplicaSet');
      expect(result).toEqual({
        namespace: '',
        name: 'test-name',
        groupKind: {
          group: 'apps',
          kind: 'ReplicaSet',
        },
      });
    });

    it('should parse RBAC resources with colon (double underscore)', () => {
      const result = parseObjectMetadata(
        'test-namespace_kubeadm__nodes-kubeadm-config_rbac.authorization.k8s.io_Role',
      );
      expect(result).toEqual({
        namespace: 'test-namespace',
        name: 'kubeadm:nodes-kubeadm-config',
        groupKind: {
          group: 'rbac.authorization.k8s.io',
          kind: 'Role',
        },
      });
    });

    it('should parse RBAC resources with double colon', () => {
      const result = parseObjectMetadata(
        'test-namespace_system____leader-locking-kube-scheduler_rbac.authorization.k8s.io_Role',
      );
      expect(result).toEqual({
        namespace: 'test-namespace',
        name: 'system::leader-locking-kube-scheduler',
        groupKind: {
          group: 'rbac.authorization.k8s.io',
          kind: 'Role',
        },
      });
    });

    it('should parse colon at beginning of name', () => {
      const result = parseObjectMetadata(
        'test-namespace___leader-locking-kube-scheduler_rbac.authorization.k8s.io_ClusterRole',
      );
      expect(result).toEqual({
        namespace: 'test-namespace',
        name: ':leader-locking-kube-scheduler',
        groupKind: {
          group: 'rbac.authorization.k8s.io',
          kind: 'ClusterRole',
        },
      });
    });

    it('should parse colon at end of name', () => {
      const result = parseObjectMetadata(
        'test-namespace_leader-locking-kube-scheduler___rbac.authorization.k8s.io_RoleBinding',
      );
      expect(result).toEqual({
        namespace: 'test-namespace',
        name: 'leader-locking-kube-scheduler:',
        groupKind: {
          group: 'rbac.authorization.k8s.io',
          kind: 'RoleBinding',
        },
      });
    });

    it('should throw error for empty string', () => {
      expect(() => parseObjectMetadata('')).toThrow(
        'Inventory ID cannot be empty',
      );
    });

    it('should throw error for not enough fields', () => {
      expect(() => parseObjectMetadata('_test-name_apps')).toThrow(
        'Unable to parse stored object metadata',
      );
    });

    it('should throw error for only one field', () => {
      expect(() =>
        parseObjectMetadata('test-namespacetest-nametest-grouptest-kind'),
      ).toThrow('Unable to parse stored object metadata');
    });

    it('should throw error for too many fields', () => {
      expect(() =>
        parseObjectMetadata('test-namespace_test-name_apps_foo_Deployment'),
      ).toThrow('Too many fields within');
    });
  });

  describe('parseInventoryEntries', () => {
    it('should parse multiple inventory entries', () => {
      const entries: InventoryEntry[] = [
        { id: 'flux-system_helm-controller_apps_Deployment' },
        { id: 'flux-system_kustomize-controller_apps_Deployment' },
        { id: '_flux-system_v1_Namespace' },
        {
          id: 'flux-system_flux-system_rbac.authorization.k8s.io_ClusterRoleBinding',
        },
      ];

      const result = parseInventoryEntries(entries);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual({
        namespace: 'flux-system',
        name: 'helm-controller',
        groupKind: { group: 'apps', kind: 'Deployment' },
      });
      expect(result[2]).toEqual({
        namespace: '',
        name: 'flux-system',
        groupKind: { group: 'v1', kind: 'Namespace' },
      });
    });

    it('should return empty array for empty input', () => {
      expect(parseInventoryEntries([])).toEqual([]);
      expect(parseInventoryEntries(null as any)).toEqual([]);
      expect(parseInventoryEntries(undefined as any)).toEqual([]);
    });
  });

  describe('formatObjectMetadata', () => {
    it('should format basic object metadata', () => {
      const objMeta: ObjectMetadata = {
        namespace: 'test-namespace',
        name: 'test-name',
        groupKind: { group: 'apps', kind: 'Deployment' },
      };

      expect(formatObjectMetadata(objMeta)).toBe(
        'test-namespace_test-name_apps_Deployment',
      );
    });

    it('should format RBAC resource with colon encoding', () => {
      const objMeta: ObjectMetadata = {
        namespace: 'test-namespace',
        name: 'kubeadm:nodes-kubeadm-config',
        groupKind: { group: 'rbac.authorization.k8s.io', kind: 'Role' },
      };

      expect(formatObjectMetadata(objMeta)).toBe(
        'test-namespace_kubeadm__nodes-kubeadm-config_rbac.authorization.k8s.io_Role',
      );
    });

    it('should round-trip correctly', () => {
      const originalIds = [
        'test-namespace_test-name_apps_Deployment',
        '_cluster-resource_v1_ConfigMap',
        'test-namespace_system____leader-locking-kube-scheduler_rbac.authorization.k8s.io_Role',
      ];

      originalIds.forEach(id => {
        const parsed = parseObjectMetadata(id);
        const formatted = formatObjectMetadata(parsed);
        expect(formatted).toBe(id);
      });
    });
  });

  describe('groupInventoryByKind', () => {
    it('should group entries by kind', () => {
      const entries: ObjectMetadata[] = [
        {
          namespace: 'flux-system',
          name: 'helm-controller',
          groupKind: { group: 'apps', kind: 'Deployment' },
        },
        {
          namespace: 'flux-system',
          name: 'kustomize-controller',
          groupKind: { group: 'apps', kind: 'Deployment' },
        },
        {
          namespace: '',
          name: 'flux-system',
          groupKind: { group: 'v1', kind: 'Namespace' },
        },
        {
          namespace: 'flux-system',
          name: 'my-service',
          groupKind: { group: 'v1', kind: 'Service' },
        },
      ];

      const result = groupInventoryByKind(entries);

      expect(result.Deployment).toHaveLength(2);
      expect(result.Namespace).toHaveLength(1);
      expect(result.Service).toHaveLength(1);
    });
  });

  describe('filterInventoryByNamespace', () => {
    it('should filter entries by namespace', () => {
      const entries: ObjectMetadata[] = [
        {
          namespace: 'flux-system',
          name: 'helm-controller',
          groupKind: { group: 'apps', kind: 'Deployment' },
        },
        {
          namespace: 'default',
          name: 'my-app',
          groupKind: { group: 'apps', kind: 'Deployment' },
        },
        {
          namespace: '',
          name: 'cluster-resource',
          groupKind: { group: 'v1', kind: 'ConfigMap' },
        },
      ];

      expect(filterInventoryByNamespace(entries, 'flux-system')).toHaveLength(
        1,
      );
      expect(filterInventoryByNamespace(entries, 'default')).toHaveLength(1);
      expect(filterInventoryByNamespace(entries, '')).toHaveLength(1);
    });
  });

  describe('isClusterScoped', () => {
    it('should identify cluster-scoped resources', () => {
      const clusterScoped: ObjectMetadata = {
        namespace: '',
        name: 'cluster-resource',
        groupKind: { group: 'v1', kind: 'ConfigMap' },
      };

      const namespaced: ObjectMetadata = {
        namespace: 'default',
        name: 'my-app',
        groupKind: { group: 'apps', kind: 'Deployment' },
      };

      expect(isClusterScoped(clusterScoped)).toBe(true);
      expect(isClusterScoped(namespaced)).toBe(false);
    });
  });
});

describe('real-world example', () => {
  it('should parse a complete Flux inventory', () => {
    // Example kustomization inventory from a real Flux deployment
    const sampleInventory: InventoryEntry[] = [
      { id: 'flux-system_helm-controller_apps_Deployment' },
      { id: 'flux-system_kustomize-controller_apps_Deployment' },
      { id: 'flux-system_notification-controller_apps_Deployment' },
      { id: 'flux-system_source-controller_apps_Deployment' },
      { id: '_flux-system_v1_Namespace' },
      { id: 'flux-system_helm-controller_v1_ServiceAccount' },
      { id: 'flux-system_kustomize-controller_v1_ServiceAccount' },
      { id: '_helm-controller_rbac.authorization.k8s.io_ClusterRole' },
      {
        id: '_flux-system__helm-controller_rbac.authorization.k8s.io_ClusterRoleBinding',
      },
      { id: 'flux-system_webhook-receiver_v1_Service' },
    ];

    // Parse all entries
    const parsedEntries = parseInventoryEntries(sampleInventory);
    expect(parsedEntries).toHaveLength(10);

    // Group by kind
    const groupedByKind = groupInventoryByKind(parsedEntries);
    expect(groupedByKind.Deployment).toHaveLength(4);
    expect(groupedByKind.ServiceAccount).toHaveLength(2);
    expect(groupedByKind.Namespace).toHaveLength(1);

    // Filter by namespace
    const fluxSystemResources = filterInventoryByNamespace(
      parsedEntries,
      'flux-system',
    );
    const clusterScopedResources = filterInventoryByNamespace(
      parsedEntries,
      '',
    );

    expect(fluxSystemResources).toHaveLength(7);
    expect(clusterScopedResources).toHaveLength(3);

    // Verify specific entries
    const namespace = parsedEntries.find(e => e.groupKind.kind === 'Namespace');
    expect(namespace).toEqual({
      namespace: '',
      name: 'flux-system',
      groupKind: { group: 'v1', kind: 'Namespace' },
    });

    const clusterRoleBinding = parsedEntries.find(
      e => e.name === 'flux-system:helm-controller',
    );
    expect(clusterRoleBinding).toEqual({
      namespace: '',
      name: 'flux-system:helm-controller',
      groupKind: {
        group: 'rbac.authorization.k8s.io',
        kind: 'ClusterRoleBinding',
      },
    });
  });
});
