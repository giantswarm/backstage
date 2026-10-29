import { Cluster } from '@giantswarm/backstage-plugin-kubernetes-react';
import { installationsByInfraKind } from './installationsByInfraKind';

function cluster(installation: string, kind?: string) {
  return new Cluster(
    {
      apiVersion: 'cluster.x-k8s.io/v1beta2',
      kind: 'Cluster',
      metadata: { name: 'c', namespace: 'org-a' },
      spec: kind
        ? {
            infrastructureRef: {
              apiGroup: 'infrastructure.cluster.x-k8s.io',
              kind,
              name: 'c',
            },
          }
        : {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    installation,
  );
}

describe('installationsByInfraKind', () => {
  it('lists each installation once per infrastructure kind', () => {
    expect(
      installationsByInfraKind([
        cluster('a', 'AWSCluster'),
        cluster('a', 'AWSCluster'),
        cluster('b', 'AWSCluster'),
        cluster('b', 'VSphereCluster'),
        cluster('c'),
      ]),
    ).toEqual({ AWSCluster: ['a', 'b'], VSphereCluster: ['b'] });
  });
});
