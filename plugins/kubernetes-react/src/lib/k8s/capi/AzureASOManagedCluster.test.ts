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

    it('returns undefined when the ResourceGroup has no location', () => {
      // Another embedded resource may sit in another region, so its location
      // is no substitute for the resource group's.
      const cluster = makeCluster({
        spec: {
          resources: [
            {
              apiVersion: 'resources.azure.com/v1api20200601',
              kind: 'ResourceGroup',
              spec: {},
            },
            {
              apiVersion: 'network.azure.com/v1api20240301',
              kind: 'VirtualNetwork',
              spec: { location: 'northeurope' },
            },
          ],
        },
      });

      expect(cluster.getLocation()).toBeUndefined();
    });

    it('ignores a ResourceGroup kind from another API group', () => {
      const cluster = makeCluster({
        spec: {
          resources: [
            {
              apiVersion: 'example.com/v1',
              kind: 'ResourceGroup',
              spec: { location: 'northeurope' },
            },
          ],
        },
      });

      expect(cluster.getLocation()).toBeUndefined();
    });

    it('returns undefined without embedded resources', () => {
      expect(makeCluster().getLocation()).toBeUndefined();
      expect(makeCluster({ spec: { resources: [] } }).getLocation()).toBe(
        undefined,
      );
    });
  });
});
