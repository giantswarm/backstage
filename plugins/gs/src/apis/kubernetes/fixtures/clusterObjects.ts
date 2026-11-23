import type { KubeObjectInterface } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  Annotations,
  Constants,
  Labels,
} from '@giantswarm/backstage-plugin-gs-common';
import {
  type FixtureCluster,
  type FixtureClusterPool,
  type FixtureDataSet,
  KARPENTER_MAX_PODS,
  fixtureDataSet,
  inInstallation,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { rbacObjectsOf } from './rbacObjects';

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
  const isAzure = cluster.provider === 'azure';
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
          [Labels.labelApp]: appOf(cluster),
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
          kind: isAzure ? 'AzureCluster' : 'AWSCluster',
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
    ...providerObjects(cluster, metadata, clusterLabels),
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
      name: appOf(cluster),
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

  for (const pool of isAzure ? cluster.pools : []) {
    if (pool.kind !== 'machinePool') {
      continue;
    }
    objects.push(
      {
        apiVersion: `${CAPI}/v1beta2`,
        kind: 'MachineDeployment',
        metadata: metadata('MachineDeployment', pool.name, {
          labels: clusterLabels,
          creationTimestamp: pool.createdAt,
        }),
        spec: {
          clusterName: cluster.name,
          replicas: pool.replicas,
          template: {
            spec: {
              clusterName: cluster.name,
              infrastructureRef: {
                apiGroup: INFRASTRUCTURE,
                kind: 'AzureMachineTemplate',
                name: pool.name,
              },
            },
          },
        },
        status: { phase: 'Running', readyReplicas: pool.readyReplicas },
      },
      {
        apiVersion: `${INFRASTRUCTURE}/v1beta1`,
        kind: 'AzureMachineTemplate',
        metadata: metadata('AzureMachineTemplate', pool.name, {
          labels: clusterLabels,
          creationTimestamp: pool.createdAt,
        }),
        spec: { template: { spec: { vmSize: pool.instanceType } } },
      },
    );
  }
  for (const pool of isAzure ? [] : cluster.pools) {
    const poolMetadata = (kind: string) =>
      metadata(kind, pool.name, {
        labels: clusterLabels,
        creationTimestamp: pool.createdAt,
      });
    const infrastructureKind =
      pool.kind === 'karpenter' ? 'KarpenterMachinePool' : 'AWSMachinePool';
    objects.push({
      apiVersion: `${CAPI}/v1beta2`,
      kind: 'MachinePool',
      metadata: poolMetadata('MachinePool'),
      spec: {
        clusterName: cluster.name,
        replicas: pool.replicas,
        template: {
          spec: {
            clusterName: cluster.name,
            infrastructureRef: {
              apiGroup: INFRASTRUCTURE,
              kind: infrastructureKind,
              name: pool.name,
            },
          },
        },
      },
      status: { phase: 'Running', readyReplicas: pool.readyReplicas },
    });
    if (pool.kind === 'machinePool') {
      objects.push({
        apiVersion: `${INFRASTRUCTURE}/v1beta2`,
        kind: 'AWSMachinePool',
        metadata: poolMetadata('AWSMachinePool'),
        spec: {
          minSize: pool.minSize,
          maxSize: pool.maxSize,
          availabilityZones: pool.zones,
          awsLaunchTemplate: { instanceType: pool.instanceType },
        },
      });
    } else {
      objects.push(karpenterMachinePoolOf(cluster, pool, poolMetadata));
    }
  }
  return objects;
}

/**
 * The KarpenterMachinePool of a Karpenter pool: the NodePool and
 * EC2NodeClass specs Giant Swarm's cluster chart renders, with the pool's
 * requirements and limits.
 */
function karpenterMachinePoolOf(
  cluster: FixtureCluster,
  pool: Extract<FixtureClusterPool, { kind: 'karpenter' }>,
  poolMetadata: (kind: string) => KubeObjectInterface['metadata'],
): KubeObjectInterface {
  const requirements = [
    {
      key: 'karpenter.sh/capacity-type',
      operator: 'In',
      values: pool.capacityTypes,
    },
    { key: 'kubernetes.io/arch', operator: 'In', values: ['amd64'] },
    {
      key: 'karpenter.k8s.aws/instance-family',
      operator: 'NotIn',
      values: pool.excludedFamilies,
    },
    { key: 'kubernetes.io/os', operator: 'In', values: ['linux'] },
    {
      key: 'karpenter.k8s.aws/instance-cpu',
      operator: 'In',
      values: ['4', '8', '16', '32'],
    },
    {
      key: 'karpenter.k8s.aws/instance-hypervisor',
      operator: 'In',
      values: ['nitro'],
    },
    ...(pool.zones
      ? [
          {
            key: 'topology.kubernetes.io/zone',
            operator: 'In',
            values: pool.zones,
          },
        ]
      : []),
  ];
  return {
    apiVersion: `${INFRASTRUCTURE}/v1alpha1`,
    kind: 'KarpenterMachinePool',
    metadata: poolMetadata('KarpenterMachinePool'),
    spec: {
      nodePool: {
        template: {
          spec: {
            requirements,
            expireAfter: '720h',
            terminationGracePeriod: '30m',
            startupTaints: [
              {
                key: 'node.cluster.x-k8s.io/uninitialized',
                value: 'true',
                effect: 'NoSchedule',
              },
              {
                key: 'node.cilium.io/agent-not-ready',
                value: 'true',
                effect: 'NoSchedule',
              },
              {
                key: 'ebs.csi.aws.com/agent-not-ready',
                value: 'true',
                effect: 'NoExecute',
              },
            ],
          },
        },
        disruption: { consolidationPolicy: 'WhenEmptyOrUnderutilized' },
        limits: pool.limits,
      },
      ec2NodeClass: {
        amiSelectorTerms: [],
        blockDeviceMappings: [
          {
            deviceName: '/dev/xvda',
            rootVolume: true,
            ebs: { volumeSize: '15Gi', volumeType: 'gp3' },
          },
        ],
        kubelet: { maxPods: KARPENTER_MAX_PODS },
        detailedMonitoring: false,
        role: `${cluster.name}-worker`,
      },
      providerIDList: pool.nodes.map(
        (node, index) =>
          `aws:///${node.zone}/i-0${(index + 1).toString(16).padStart(16, '0')}`,
      ),
    },
    status: { ready: true, replicas: pool.nodes.length },
  };
}

/** The cluster chart that installs the cluster. */
function appOf(cluster: FixtureCluster): string {
  return cluster.provider === 'azure' ? 'cluster-azure' : 'cluster-aws';
}

/**
 * The provider's cluster: an AWSCluster with the AWSClusterRoleIdentity
 * that names its account, or an AzureCluster with its location.
 */
function providerObjects(
  cluster: FixtureCluster,
  metadata: (kind: string, name: string, extra?: object) => object,
  clusterLabels: Record<string, string>,
): KubeObjectInterface[] {
  const labels = {
    ...clusterLabels,
    [Labels.labelAppVersion]: cluster.appVersion,
  };
  if (cluster.provider === 'azure') {
    return [
      {
        apiVersion: `${INFRASTRUCTURE}/v1beta1`,
        kind: 'AzureCluster',
        metadata: metadata('AzureCluster', cluster.name, { labels }),
        spec: { location: cluster.region },
      } as KubeObjectInterface,
    ];
  }
  return [
    {
      apiVersion: `${INFRASTRUCTURE}/v1beta2`,
      kind: 'AWSCluster',
      metadata: metadata('AWSCluster', cluster.name, { labels }),
      spec: {
        region: cluster.region,
        identityRef: { kind: 'AWSClusterRoleIdentity', name: cluster.name },
      },
    } as KubeObjectInterface,
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
  ];
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
 * MachinePool per node pool with the AWSMachinePool or KarpenterMachinePool
 * it points at, plus the Release of each release the clusters run and the
 * management cluster's RoleBindings and ClusterRoleBindings, as the Clusters
 * pages and the Platform section's list and cluster pages read them. The
 * same array while the data set stays the same.
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
      ...rbacObjectsOf(data.rbacBindings, installation),
    ];
    byInstallation.set(installation, objects);
  }
  return objects;
}
