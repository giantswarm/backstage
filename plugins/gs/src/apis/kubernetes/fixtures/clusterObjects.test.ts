import {
  AWSCluster,
  AWSClusterRoleIdentity,
  Cluster,
  ControlPlane,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  inInstallation,
  setFixtureScenarioForTests,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { fixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { collectClusterData } from '../../../components/clusters/ClustersDataProvider/utils';
import { gsKubernetesObjectsOf } from './clusterObjects';

describe('gsKubernetesObjectsOf', () => {
  afterEach(() => setFixtureScenarioForTests(undefined));

  function objectsOfKind(kind: string) {
    return gsKubernetesObjectsOf('meadow').filter(o => o.kind === kind);
  }

  it('answers the same array while the data set stays the same', () => {
    expect(gsKubernetesObjectsOf('meadow')).toBe(
      gsKubernetesObjectsOf('meadow'),
    );
  });

  it('reads back as the data set says through the Clusters pages', () => {
    const clusters = inInstallation(fixtureDataSet().clusters, 'meadow');
    const byName = (kind: string, name: string) =>
      objectsOfKind(kind).find(o => o.metadata.name === name)!;

    for (const fixture of clusters) {
      const cluster = new Cluster(
        byName('Cluster', fixture.name) as any,
        'meadow',
      );
      const providerCluster = new AWSCluster(
        byName('AWSCluster', fixture.name) as any,
        'meadow',
      );
      const data = collectClusterData({
        installationName: 'meadow',
        cluster,
        controlPlane: new ControlPlane(
          byName('KubeadmControlPlane', fixture.name) as any,
          'meadow',
        ),
        providerCluster,
        awsClusterRoleIdentity: new AWSClusterRoleIdentity(
          byName('AWSClusterRoleIdentity', fixture.name) as any,
          'meadow',
        ),
      });
      expect(data).toMatchObject({
        name: fixture.name,
        type: fixture.kind,
        status: fixture.state,
        organization: fixture.organization,
        releaseVersion: fixture.releaseVersion,
        kubernetesVersion: `v${fixture.kubernetesVersion}`,
        provider: 'aws',
        location: fixture.region,
        awsAccountId: fixture.awsAccountId,
        appVersion: fixture.appVersion,
      });
    }
  });

  it('serves a MachinePool and an AWSMachinePool per node pool', () => {
    const pools = inInstallation(fixtureDataSet().clusters, 'meadow').flatMap(
      c => c.pools,
    );
    expect(objectsOfKind('MachinePool')).toHaveLength(pools.length);
    expect(objectsOfKind('AWSMachinePool')).toHaveLength(pools.length);
  });

  it('serves the App that installs each cluster, applied by Flux where the cluster is managed through GitOps', () => {
    const fixtures = inInstallation(fixtureDataSet().clusters, 'meadow');
    const apps = objectsOfKind('App');
    expect(apps).toHaveLength(fixtures.length);
    const kustomizations = objectsOfKind('Kustomization');
    const repositories = objectsOfKind('GitRepository');
    expect(fixtures.some(f => f.gitOpsRepository)).toBe(true);
    expect(fixtures.some(f => !f.gitOpsRepository)).toBe(true);
    for (const fixture of fixtures) {
      const app = apps.find(a => a.metadata.name === fixture.name)!;
      expect(app.metadata.labels?.['kustomize.toolkit.fluxcd.io/name']).toBe(
        fixture.gitOpsRepository,
      );
    }
    const repositoriesUsed = new Set(
      fixtures.flatMap(f => (f.gitOpsRepository ? [f.gitOpsRepository] : [])),
    );
    expect(new Set(kustomizations.map(k => k.metadata.name))).toEqual(
      repositoriesUsed,
    );
    expect(new Set(repositories.map(r => r.metadata.name))).toEqual(
      repositoriesUsed,
    );
    for (const kustomization of kustomizations as any[]) {
      expect(kustomization.spec.sourceRef.name).toBe(
        kustomization.metadata.name,
      );
    }
  });

  it('gives every object its own uid', () => {
    const uids = gsKubernetesObjectsOf('meadow').map(o => o.metadata.uid);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('puts an organization’s clusters in its namespace, `org-<organization>`', () => {
    const fixtures = inInstallation(fixtureDataSet().clusters, 'meadow');
    for (const cluster of objectsOfKind('Cluster')) {
      const fixture = fixtures.find(f => f.name === cluster.metadata.name)!;
      expect(cluster.metadata.namespace).toBe(
        fixture.kind === 'management'
          ? 'org-giantswarm'
          : `org-${fixture.organization}`,
      );
      expect(cluster.metadata.namespace).not.toMatch(/^org-org-/);
    }
  });

  it('serves no cluster in the empty scenario', () => {
    setFixtureScenarioForTests('empty');
    expect(gsKubernetesObjectsOf('meadow')).toEqual([]);
  });
});
