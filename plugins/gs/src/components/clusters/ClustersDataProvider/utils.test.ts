import {
  AzureASOManagedCluster,
  AzureASOManagedControlPlane,
  Cluster,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { collectClusterData } from './utils';

describe('collectClusterData', () => {
  it('reads the version and the location of a CAPZ managed (AKS) cluster', () => {
    const installationName = 'installation-1';
    const cluster = new Cluster(
      {
        apiVersion: 'cluster.x-k8s.io/v1beta1',
        kind: 'Cluster',
        metadata: {
          name: 'my-cluster',
          namespace: 'org-test',
          labels: { app: 'cluster-aks' },
        },
        spec: {
          controlPlaneRef: {
            apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
            kind: 'AzureASOManagedControlPlane',
            name: 'my-cluster',
            namespace: 'org-test',
          },
          infrastructureRef: {
            apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
            kind: 'AzureASOManagedCluster',
            name: 'my-cluster',
            namespace: 'org-test',
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      installationName,
    );
    const controlPlane = new AzureASOManagedControlPlane(
      {
        apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
        kind: 'AzureASOManagedControlPlane',
        metadata: { name: 'my-cluster', namespace: 'org-test' },
        spec: { version: 'v1.32.5' },
      },
      installationName,
    );
    const providerCluster = new AzureASOManagedCluster(
      {
        apiVersion: 'infrastructure.cluster.x-k8s.io/v1beta1',
        kind: 'AzureASOManagedCluster',
        metadata: {
          name: 'my-cluster',
          namespace: 'org-test',
          labels: { 'app.kubernetes.io/version': '0.5.0' },
        },
        spec: {
          resources: [
            {
              apiVersion: 'resources.azure.com/v1api20200601',
              kind: 'ResourceGroup',
              spec: { location: 'westeurope' },
            },
          ],
        },
      },
      installationName,
    );

    const data = collectClusterData({
      installationName,
      cluster,
      controlPlane,
      providerCluster,
    });

    expect(data).toMatchObject({
      installationName,
      name: 'my-cluster',
      namespace: 'org-test',
      provider: 'azure',
      kubernetesVersion: 'v1.32.5',
      location: 'westeurope',
      appVersion: '0.5.0',
      appSourceLocation: 'https://github.com/giantswarm/cluster-aks',
    });
  });
});
