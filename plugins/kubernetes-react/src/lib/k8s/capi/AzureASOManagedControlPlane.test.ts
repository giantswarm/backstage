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
});
