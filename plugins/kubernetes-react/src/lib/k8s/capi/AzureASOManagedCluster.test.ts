import {
  AzureASOManagedCluster,
  AzureASOManagedClusterInterface,
} from './AzureASOManagedCluster';

function makeCluster(
  partial: Partial<AzureASOManagedClusterInterface> = {},
): AzureASOManagedCluster {
  const json = {
    apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
    kind: 'AzureASOManagedCluster',
    metadata: { name: 'my-cluster', namespace: 'org-test' },
    ...partial,
  } as AzureASOManagedClusterInterface;

  return new AzureASOManagedCluster(json, 'installation-1');
}

describe('AzureASOManagedCluster', () => {
  describe('getLocation', () => {
    it('reads the location of the embedded ResourceGroup', () => {
      const cluster = makeCluster({
        spec: {
          resources: [
            {
              apiVersion: 'network.azure.com/v1api20201101',
              kind: 'VirtualNetwork',
              spec: { location: 'northeurope' },
            },
            {
              apiVersion: 'resources.azure.com/v1api20200601',
              kind: 'ResourceGroup',
              spec: { location: 'westeurope' },
            },
          ],
        },
      });

      expect(cluster.getLocation()).toBe('westeurope');
    });

    it('falls back to the first embedded resource with a location', () => {
      const cluster = makeCluster({
        spec: {
          resources: [
            { kind: 'VirtualNetworksSubnet', spec: {} },
            { kind: 'VirtualNetwork', spec: { location: 'northeurope' } },
          ],
        },
      });

      expect(cluster.getLocation()).toBe('northeurope');
    });

    it('returns undefined without embedded resources', () => {
      expect(makeCluster().getLocation()).toBeUndefined();
      expect(makeCluster({ spec: { resources: [] } }).getLocation()).toBe(
        undefined,
      );
    });
  });

  describe('matchesRef', () => {
    it('matches a reference with apiGroup', () => {
      expect(
        AzureASOManagedCluster.matchesRef({
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: 'AzureASOManagedCluster',
        }),
      ).toBe(true);
    });

    it('does not match an AzureCluster reference', () => {
      expect(
        AzureASOManagedCluster.matchesRef({
          apiGroup: 'infrastructure.cluster.x-k8s.io',
          kind: 'AzureCluster',
        }),
      ).toBe(false);
    });
  });
});
