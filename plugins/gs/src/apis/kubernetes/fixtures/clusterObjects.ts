import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  Annotations,
  Constants,
  Labels,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  type FixtureCluster,
  type FixtureDataSet,
  fixtureDataSet,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';

const CAPI = 'cluster.x-k8s.io';
const INFRASTRUCTURE = 'infrastructure.cluster.x-k8s.io';
const CONTROL_PLANE = 'controlplane.cluster.x-k8s.io';
const APPLICATION = 'application.giantswarm.io';
const KUSTOMIZE = 'kustomize.toolkit.fluxcd.io';
const SOURCE = 'source.toolkit.fluxcd.io';

/** Where the fixture GitOps repositories live, a made-up owner. */
const GIT_OWNER = 'https://github.com/example';

/** The commit the fixture GitOps repositories are at. */
const REVISION = '3f9a2c1d8e0b6a4f1c2d3e4f5a6b7c8d9e0f1a2b';

/**
 * The cluster releases an installation offers (`release.giantswarm.io`),
 * active, each with the day it came out: what the cluster page's "Newer
 * release" reads. Their versions are the fixture clusters' releases.
 */
const RELEASE_DATES: Record<string, string> = {
  '30.1.2': '2025-03-04T00:00:00Z',
  '31.1.0': '2025-09-18T00:00:00Z',
  '32.0.0': '2026-09-18T00:00:00Z',
};

function releasesOf(
  installation: string,
  clusters: readonly FixtureCluster[],
): KubeObjectInterface[] {
  const versions = new Set(clusters.map(cluster => cluster.releaseVersion));
  return [...versions].map(version => ({
    apiVersion: 'release.giantswarm.io/v1alpha1',
    kind: 'Release',
    metadata: {
      name: `aws-${version}`,
      uid: `${installation}-Release-aws-${version}`,
      creationTimestamp: RELEASE_DATES[version] ?? clusters[0].createdAt,
    },
    spec: {
      apps: [],
      components: [{ name: 'cluster-aws', version: '0.0.0' }],
      date: RELEASE_DATES[version] ?? clusters[0].createdAt,
      state: 'active',
    },
  }));
}

/** The namespace of the Flux objects that apply the clusters. */
const FLUX_NAMESPACE = 'flux-giantswarm';

/** The namespace of an organization's clusters, as Giant Swarm names it. */
function namespaceOf(cluster: FixtureCluster): string {
  return cluster.kind === 'management'
    ? Constants.MANAGEMENT_CLUSTER_NAMESPACE
    : `org-${cluster.organization}`;
}

/** The objects of one cluster: what the Clusters pages read of it. */
function objectsOf(cluster: FixtureCluster): KubeObjectInterface[] {
  const namespace = namespaceOf(cluster);
  const clusterLabels = { [Labels.labelClusterName]: cluster.name };
  const creating = cluster.state === 'creating';
  // The kind in the uid: a cluster's objects share its name, and a pool's
  // MachinePool and AWSMachinePool theirs.
  const metadata = (kind: string, name: string, extra: object = {}) => ({
    name,
    namespace,
    uid: `${cluster.installation}-${kind}-${namespace}-${name}`,
    creationTimestamp: cluster.createdAt,
    ...extra,
  });

  const objects: KubeObjectInterface[] = [
    {
      apiVersion: `${CAPI}/v1beta2`,
      kind: 'Cluster',
      metadata: metadata('Cluster', cluster.name, {
        ...(cluster.state === 'deleting' && {
          deletionTimestamp: cluster.createdAt,
        }),
        labels: {
          ...clusterLabels,
          [Labels.labelApp]: 'cluster-aws',
          [Labels.labelAppVersion]: cluster.appVersion,
          [Labels.labelReleaseVersion]: cluster.releaseVersion,
          [Labels.labelOrganization]: cluster.organization,
          [Labels.labelServicePriority]: cluster.servicePriority,
        },
        ...(cluster.description && {
          annotations: {
            [Annotations.annotationClusterDescription]: cluster.description,
          },
        }),
      }),
      spec: {
        controlPlaneEndpoint: {
          host: `api.${cluster.name}.${cluster.installation}.example.com`,
          port: 443,
        },
        infrastructureRef: {
          apiGroup: INFRASTRUCTURE,
          kind: 'AWSCluster',
          name: cluster.name,
        },
        controlPlaneRef: {
          apiGroup: CONTROL_PLANE,
          kind: 'KubeadmControlPlane',
          name: cluster.name,
        },
      },
      status: {
        conditions: [
          {
            type: 'ControlPlaneInitialized',
            status: creating ? 'False' : 'True',
            reason: creating ? 'WaitingForControlPlane' : 'Initialized',
            lastTransitionTime: cluster.createdAt,
          },
        ],
      },
    },
    {
      apiVersion: `${INFRASTRUCTURE}/v1beta2`,
      kind: 'AWSCluster',
      metadata: metadata('AWSCluster', cluster.name, {
        labels: {
          ...clusterLabels,
          [Labels.labelAppVersion]: cluster.appVersion,
        },
      }),
      spec: {
        region: cluster.region,
        identityRef: { kind: 'AWSClusterRoleIdentity', name: cluster.name },
      },
    },
    {
      apiVersion: `${INFRASTRUCTURE}/v1beta2`,
      kind: 'AWSClusterRoleIdentity',
      metadata: {
        name: cluster.name,
        uid: `${cluster.installation}-AWSClusterRoleIdentity-${cluster.name}`,
        creationTimestamp: cluster.createdAt,
      },
      spec: {
        roleARN: `arn:aws:iam::${cluster.awsAccountId}:role/giantswarm-${cluster.installation}-capa-controller`,
      },
    },
    {
      apiVersion: `${CONTROL_PLANE}/v1beta2`,
      kind: 'KubeadmControlPlane',
      metadata: metadata('KubeadmControlPlane', cluster.name, {
        labels: clusterLabels,
      }),
      spec: {
        version: `v${cluster.kubernetesVersion}`,
        replicas: cluster.kind === 'management' ? 3 : 1,
      },
    },
  ];

  // The App that installs the cluster, as the cluster chart's App is named;
  // where the cluster is managed through GitOps, a Flux Kustomization named
  // after its repository applies it, with the GitRepository it reads. The
  // clusters of one repository share both (see `withoutDuplicates`).
  const kustomization = cluster.gitOpsRepository;
  objects.push({
    apiVersion: `${APPLICATION}/v1alpha1`,
    kind: 'App',
    metadata: metadata('App', cluster.name, {
      labels: {
        ...clusterLabels,
        ...(kustomization && {
          [`${KUSTOMIZE}/name`]: kustomization,
          [`${KUSTOMIZE}/namespace`]: FLUX_NAMESPACE,
        }),
      },
    }),
    spec: {
      name: 'cluster-aws',
      namespace,
      version: cluster.appVersion,
      catalog: 'cluster',
      kubeConfig: { inCluster: true },
    },
    status: {
      version: cluster.appVersion,
      release: { status: creating ? 'pending-install' : 'deployed' },
    },
  });
  if (kustomization) {
    const fluxMetadata = (kind: string, name: string) => ({
      name,
      namespace: FLUX_NAMESPACE,
      uid: `${cluster.installation}-${kind}-${FLUX_NAMESPACE}-${name}`,
      creationTimestamp: cluster.createdAt,
    });
    objects.push(
      {
        apiVersion: `${KUSTOMIZE}/v1`,
        kind: 'Kustomization',
        metadata: fluxMetadata('Kustomization', kustomization),
        spec: {
          interval: '10m',
          path: './clusters',
          prune: true,
          sourceRef: { kind: 'GitRepository', name: kustomization },
        },
        status: {
          lastAppliedRevision: `main@sha1:${REVISION}`,
          conditions: [
            {
              type: 'Ready',
              status: 'True',
              reason: 'ReconciliationSucceeded',
              message: `Applied revision: main@sha1:${REVISION}`,
              lastTransitionTime: cluster.createdAt,
            },
          ],
        },
      },
      {
        apiVersion: `${SOURCE}/v1`,
        kind: 'GitRepository',
        metadata: fluxMetadata('GitRepository', kustomization),
        spec: {
          interval: '1m',
          url: `${GIT_OWNER}/${kustomization}`,
          ref: { branch: 'main' },
        },
        status: {
          artifact: {
            revision: `main@sha1:${REVISION}`,
          },
        },
      },
    );
  }

  for (const pool of cluster.pools) {
    objects.push(
      {
        apiVersion: `${CAPI}/v1beta2`,
        kind: 'MachinePool',
        metadata: metadata('MachinePool', pool.name, { labels: clusterLabels }),
        spec: {
          clusterName: cluster.name,
          replicas: pool.replicas,
          template: {
            spec: {
              clusterName: cluster.name,
              infrastructureRef: {
                apiGroup: INFRASTRUCTURE,
                kind: 'AWSMachinePool',
                name: pool.name,
              },
            },
          },
        },
        status: { phase: 'Running', readyReplicas: pool.replicas },
      },
      {
        apiVersion: `${INFRASTRUCTURE}/v1beta2`,
        kind: 'AWSMachinePool',
        metadata: metadata('AWSMachinePool', pool.name, {
          labels: clusterLabels,
        }),
        spec: {
          minSize: 1,
          maxSize: Math.max(pool.replicas, 10),
          awsLaunchTemplate: { instanceType: pool.instanceType },
        },
      },
    );
  }
  return objects;
}

/** The objects with the first of each uid: shared Flux objects once. */
function withoutDuplicates(
  objects: KubeObjectInterface[],
): KubeObjectInterface[] {
  const seen = new Set<string | undefined>();
  return objects.filter(object => {
    const uid = object.metadata.uid;
    if (seen.has(uid)) {
      return false;
    }
    seen.add(uid);
    return true;
  });
}

const cache = new WeakMap<FixtureDataSet, Map<string, KubeObjectInterface[]>>();

/**
 * The Cluster API objects of an installation in fixture mode: per cluster of
 * the data set, its Cluster, AWSCluster, AWSClusterRoleIdentity,
 * KubeadmControlPlane, the App that installs it (with the Flux Kustomization
 * and GitRepository that apply it, where it is managed through GitOps), and a
 * MachinePool and AWSMachinePool per node pool, plus the Release of each
 * release the clusters run,
 * as the Clusters pages and the Platform section's list read them. The same
 * array while the data set stays the same.
 */
export function gsKubernetesObjectsOf(
  installation: string,
): readonly KubeObjectInterface[] {
  const data = fixtureDataSet();
  let byInstallation = cache.get(data);
  if (!byInstallation) {
    byInstallation = new Map();
    cache.set(data, byInstallation);
  }
  let objects = byInstallation.get(installation);
  if (!objects) {
    const clusters = inInstallation(data.clusters, installation);
    objects = [
      ...withoutDuplicates(clusters.flatMap(objectsOf)),
      ...releasesOf(installation, clusters),
    ];
    byInstallation.set(installation, objects);
  }
  return objects;
}
