import { isKubeadmControlPlaneRef } from './utils';

describe('isKubeadmControlPlaneRef', () => {
  it('matches a v1beta2 ref to a KubeadmControlPlane', () => {
    expect(
      isKubeadmControlPlaneRef({
        apiGroup: 'controlplane.cluster.x-k8s.io',
        kind: 'KubeadmControlPlane',
        name: 'my-cluster',
        namespace: 'org-test',
      }),
    ).toBe(true);
  });

  it('matches a v1beta1 ref to a KubeadmControlPlane', () => {
    expect(
      isKubeadmControlPlaneRef({
        apiVersion: 'controlplane.cluster.x-k8s.io/v1beta1',
        kind: 'KubeadmControlPlane',
        name: 'my-cluster',
        namespace: 'org-test',
      }),
    ).toBe(true);
  });

  it('matches on kind alone when the ref carries no group', () => {
    expect(
      isKubeadmControlPlaneRef({
        kind: 'KubeadmControlPlane',
        name: 'my-cluster',
        namespace: 'org-test',
      }),
    ).toBe(true);
  });

  it('rejects an AKS managed control plane (AzureASOManagedControlPlane)', () => {
    expect(
      isKubeadmControlPlaneRef({
        apiGroup: 'infrastructure.cluster.x-k8s.io',
        kind: 'AzureASOManagedControlPlane',
        name: 'my-aks',
        namespace: 'org-test',
      }),
    ).toBe(false);
  });

  it('rejects an EKS managed control plane (AWSManagedControlPlane)', () => {
    expect(
      isKubeadmControlPlaneRef({
        apiVersion: 'controlplane.cluster.x-k8s.io/v1beta2',
        kind: 'AWSManagedControlPlane',
        name: 'my-eks',
        namespace: 'org-test',
      }),
    ).toBe(false);
  });

  it('rejects a KubeadmControlPlane kind from a foreign API group', () => {
    expect(
      isKubeadmControlPlaneRef({
        apiGroup: 'example.com',
        kind: 'KubeadmControlPlane',
        name: 'my-cluster',
        namespace: 'org-test',
      }),
    ).toBe(false);
  });
});
