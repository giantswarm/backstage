import { KubeObject } from '@giantswarm/backstage-plugin-kubernetes-react';
import { findResourceByRef } from './findResourceByRef';

// Helper to create mock KubeObject instances
function createMockResource(overrides: {
  apiVersion: string;
  kind: string;
  name: string;
  namespace?: string;
  cluster: string;
}): KubeObject {
  const { apiVersion, kind, name, namespace, cluster } = overrides;

  const json = {
    apiVersion,
    kind,
    metadata: {
      name,
      namespace,
    },
  };

  return new KubeObject(json, cluster);
}

describe('findResourceByRef', () => {
  describe('exact apiVersion matching', () => {
    it('finds resource with exact apiVersion match', () => {
      const resources = [
        createMockResource({
          apiVersion: 'controlplane.cluster.x-k8s.io/v1beta1',
          kind: 'KubeadmControlPlane',
          name: 'my-cluster-control-plane',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'controlplane.cluster.x-k8s.io/v1beta1',
        kind: 'KubeadmControlPlane',
        name: 'my-cluster-control-plane',
        namespace: 'org-test',
      });

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe('my-cluster-control-plane');
    });
  });

  describe('group-based matching', () => {
    it('matches when ref has v1beta1 and resource has v1beta2 (same group)', () => {
      const resources = [
        createMockResource({
          apiVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
          kind: 'KubeadmControlPlane',
          name: 'my-cluster-control-plane',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'controlplane.cluster.x-k8s.io/v1beta1',
        kind: 'KubeadmControlPlane',
        name: 'my-cluster-control-plane',
        namespace: 'org-test',
      });

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe('my-cluster-control-plane');
    });

    it('does not match when API groups are different', () => {
      const resources = [
        createMockResource({
          apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
          kind: 'AWSManagedControlPlane',
          name: 'my-cluster-control-plane',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'controlplane.cluster.x-k8s.io/v1beta1',
        kind: 'AWSManagedControlPlane',
        name: 'my-cluster-control-plane',
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });

    it('matches infrastructure resources with different versions', () => {
      const resources = [
        createMockResource({
          apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
          kind: 'AWSCluster',
          name: 'my-aws-cluster',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
        kind: 'AWSCluster',
        name: 'my-aws-cluster',
        namespace: 'org-test',
      });

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe('my-aws-cluster');
    });
  });

  describe('apiGroup format (TypedLocalObjectReference)', () => {
    it('matches when apiGroup is provided directly', () => {
      const resources = [
        createMockResource({
          apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
          kind: 'AWSClusterRoleIdentity',
          name: 'my-identity',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiGroup: 'infrastructure.cluster.x-k8s.io',
        kind: 'AWSClusterRoleIdentity',
        name: 'my-identity',
        namespace: 'org-test',
      });

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe('my-identity');
    });

    it('does not match when apiGroup differs', () => {
      const resources = [
        createMockResource({
          apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta2',
          kind: 'AWSClusterRoleIdentity',
          name: 'my-identity',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiGroup: 'controlplane.cluster.x-k8s.io',
        kind: 'AWSClusterRoleIdentity',
        name: 'my-identity',
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });

    it('does not match core resource when apiGroup is specified', () => {
      const resources = [
        createMockResource({
          apiVersion: 'v1',
          kind: 'Secret',
          name: 'my-secret',
          namespace: 'default',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiGroup: 'some.api.group',
        kind: 'Secret',
        name: 'my-secret',
        namespace: 'default',
      });

      expect(result).toBeNull();
    });
  });

  describe('core resources', () => {
    it('uses exact match for core resources (no group)', () => {
      const resources = [
        createMockResource({
          apiVersion: 'v1',
          kind: 'Secret',
          name: 'my-secret',
          namespace: 'default',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'v1',
        kind: 'Secret',
        name: 'my-secret',
        namespace: 'default',
      });

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe('my-secret');
    });

    it('does not match core resource with wrong version', () => {
      const resources = [
        createMockResource({
          apiVersion: 'v1',
          kind: 'Secret',
          name: 'my-secret',
          namespace: 'default',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'v2',
        kind: 'Secret',
        name: 'my-secret',
        namespace: 'default',
      });

      expect(result).toBeNull();
    });
  });

  describe('missing apiVersion in ref', () => {
    it('matches any resource when apiVersion is not specified in ref', () => {
      const resources = [
        createMockResource({
          apiVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
          kind: 'KubeadmControlPlane',
          name: 'my-cluster-control-plane',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        kind: 'KubeadmControlPlane',
        name: 'my-cluster-control-plane',
        namespace: 'org-test',
      });

      expect(result).not.toBeNull();
      expect(result?.getName()).toBe('my-cluster-control-plane');
    });
  });

  describe('multi-cluster scenarios', () => {
    it('matches correct resource by installationName', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'shared-cluster-name',
          namespace: 'org-test',
          cluster: 'installation-1',
        }),
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'shared-cluster-name',
          namespace: 'org-test',
          cluster: 'installation-2',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'installation-2',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        name: 'shared-cluster-name',
        namespace: 'org-test',
      });

      expect(result).not.toBeNull();
      expect(result?.cluster).toBe('installation-2');
    });

    it('returns null when installationName does not match', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'my-cluster',
          namespace: 'org-test',
          cluster: 'installation-1',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'non-existent-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        name: 'my-cluster',
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });
  });

  describe('namespace matching', () => {
    it('matches when namespace is not specified in ref', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'my-cluster',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        name: 'my-cluster',
      });

      expect(result).not.toBeNull();
      expect(result?.getNamespace()).toBe('org-test');
    });

    it('does not match when namespace is different', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'my-cluster',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        name: 'my-cluster',
        namespace: 'org-other',
      });

      expect(result).toBeNull();
    });
  });

  describe('kind matching', () => {
    it('does not match when kind is different', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'my-cluster',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'MachineDeployment',
        name: 'my-cluster',
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });
  });

  describe('name matching', () => {
    it('does not match when name is different', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'my-cluster',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        name: 'different-cluster',
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });
  });

  describe('empty resources', () => {
    it('returns null when resources array is empty', () => {
      const result = findResourceByRef([], {
        installationName: 'test-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        name: 'my-cluster',
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });
  });

  describe('missing required fields', () => {
    it('returns null when kind is undefined', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'my-cluster',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: undefined,
        name: 'my-cluster',
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });

    it('returns null when name is undefined', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'my-cluster',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        name: undefined,
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });

    it('returns null when both kind and name are undefined', () => {
      const resources = [
        createMockResource({
          apiVersion: 'cluster.x-k8s.io/v1beta1',
          kind: 'Cluster',
          name: 'my-cluster',
          namespace: 'org-test',
          cluster: 'test-installation',
        }),
      ];

      const result = findResourceByRef(resources, {
        installationName: 'test-installation',
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        namespace: 'org-test',
      });

      expect(result).toBeNull();
    });
  });
});
