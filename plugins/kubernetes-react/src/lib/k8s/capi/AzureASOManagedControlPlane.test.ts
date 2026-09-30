import {
  AzureASOManagedControlPlane,
  AzureASOManagedControlPlaneInterface,
} from './AzureASOManagedControlPlane';

function makeControlPlane(
  partial: Partial<AzureASOManagedControlPlaneInterface> = {},
): AzureASOManagedControlPlane {
  const json = {
    apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
    kind: 'AzureASOManagedControlPlane',
    metadata: { name: 'my-cluster', namespace: 'org-test' },
    ...partial,
  } as AzureASOManagedControlPlaneInterface;

  return new AzureASOManagedControlPlane(json, 'installation-1');
}

describe('AzureASOManagedControlPlane', () => {
  it('reads the Kubernetes version from the spec', () => {
    const controlPlane = makeControlPlane({
      spec: { version: 'v1.32.5' },
      status: { version: 'v1.32.4' },
    });

    expect(controlPlane.getK8sVersion()).toBe('v1.32.5');
  });

  it('falls back to the observed version when the spec has none', () => {
    // spec.version is optional in CAPZ; the version may come from the
    // embedded ManagedCluster instead. The controller still reports it.
    const controlPlane = makeControlPlane({
      spec: {},
      status: { version: 'v1.32.4' },
    });

    expect(controlPlane.getK8sVersion()).toBe('v1.32.4');
  });

  it('returns undefined without a spec and a status', () => {
    expect(makeControlPlane().getK8sVersion()).toBeUndefined();
  });

  describe('matchesRef', () => {
    it('matches a reference with apiGroup', () => {
      expect(
        AzureASOManagedControlPlane.matchesRef({
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: 'AzureASOManagedControlPlane',
        }),
      ).toBe(true);
    });

    it('matches a reference with apiVersion', () => {
      expect(
        AzureASOManagedControlPlane.matchesRef({
          apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
          kind: 'AzureASOManagedControlPlane',
        }),
      ).toBe(true);
    });

    it('does not match a KubeadmControlPlane reference', () => {
      expect(
        AzureASOManagedControlPlane.matchesRef({
          apiGroup: 'controlplane.cluster.x-k8s.io',
          kind: 'KubeadmControlPlane',
        }),
      ).toBe(false);
    });
  });
});
