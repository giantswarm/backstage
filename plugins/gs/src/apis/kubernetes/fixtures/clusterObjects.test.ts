import {
  AWSCluster,
  AWSClusterRoleIdentity,
  Cluster,
  ClusterRoleBinding,
  ControlPlane,
  RoleBinding,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  inInstallation,
  setFixtureScenarioForTests,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { fixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { collectClusterData } from '../../../components/clusters/ClustersDataProvider/utils';
import { buildRbacSubjectRows } from '../../../components/clusters/cluster-details/ClusterRBAC/utils';
import { gsKubernetesObjectsOf } from './clusterObjects';

describe('gsKubernetesObjectsOf', () => {
  afterEach(() => setFixtureScenarioForTests(undefined));

  function objectsOfKind(kind: string) {
    return gsKubernetesObjectsOf('meadow').filter(o => o.kind === kind);
  }

  it('serves the management cluster’s role bindings as the RBAC tab reads them', () => {
    const rows = (installation: string) => {
      const objects = gsKubernetesObjectsOf(installation);
      return buildRbacSubjectRows(
        objects
          .filter(o => o.kind === 'RoleBinding')
          .map(o => new RoleBinding(o as any, installation)),
        objects
          .filter(o => o.kind === 'ClusterRoleBinding')
          .map(o => new ClusterRoleBinding(o as any, installation)),
      );
    };

    const meadow = rows('meadow');
    expect(new Set(meadow.map(row => row.kind))).toEqual(
      new Set(['Group', 'User', 'ServiceAccount']),
    );
    expect(meadow.some(row => row.isSystem)).toBe(true);
    expect(meadow.some(row => !row.isSystem && row.clusterWide)).toBe(true);
    // A subject with access cluster-wide or in several namespaces.
    expect(meadow.some(row => row.scopeText.includes(', '))).toBe(true);
    // fennel's management cluster has only the system subjects.
    const fennel = rows('fennel');
    expect(fennel.length).toBeGreaterThan(0);
    expect(fennel.every(row => row.isSystem)).toBe(true);
  });

  it('answers the same array while the data set stays the same', () => {
    expect(gsKubernetesObjectsOf('meadow')).toBe(
      gsKubernetesObjectsOf('meadow'),
    );
  });

  it('reads back as the data set says through the Clusters pages', () => {
    const clusters = inInstallation(fixtureDataSet().clusters, 'meadow').filter(
      c => c.provider === 'aws',
    );
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

  it('serves an Azure cluster with a MachineDeployment and AzureMachineTemplate per node pool', () => {
    const azure = inInstallation(fixtureDataSet().clusters, 'meadow').filter(
      c => c.provider === 'azure',
    );
    expect(azure).toHaveLength(1);
    const pools = azure.flatMap(c => c.pools);
    expect(objectsOfKind('AzureCluster')).toHaveLength(1);
    expect(objectsOfKind('MachineDeployment')).toHaveLength(pools.length);
    expect(objectsOfKind('AzureMachineTemplate')).toHaveLength(pools.length);
  });

  it('serves a MachinePool per node pool, with its AWSMachinePool or KarpenterMachinePool', () => {
    const pools = inInstallation(fixtureDataSet().clusters, 'meadow')
      .filter(c => c.provider === 'aws')
      .flatMap(c => c.pools);
    const karpenter = pools.filter(pool => pool.kind === 'karpenter');
    expect(karpenter.length).toBeGreaterThan(0);
    expect(objectsOfKind('MachinePool')).toHaveLength(pools.length);
    expect(objectsOfKind('AWSMachinePool')).toHaveLength(
      pools.length - karpenter.length,
    );
    expect(objectsOfKind('KarpenterMachinePool')).toHaveLength(
      karpenter.length,
    );
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
