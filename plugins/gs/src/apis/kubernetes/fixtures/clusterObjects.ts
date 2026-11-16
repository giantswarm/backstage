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
  const metadata = (name: string, extra: object = {}) => ({
    name,
    namespace,
    uid: `${cluster.installation}-${namespace}-${name}`,
    creationTimestamp: cluster.createdAt,
    ...extra,
  });

  const objects: KubeObjectInterface[] = [
    {
      apiVersion: `${CAPI}/v1beta2`,
      kind: 'Cluster',
      metadata: metadata(cluster.name, {
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
      metadata: metadata(cluster.name, {
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
        uid: `${cluster.installation}-identity-${cluster.name}`,
        creationTimestamp: cluster.createdAt,
      },
      spec: {
        roleARN: `arn:aws:iam::${cluster.awsAccountId}:role/giantswarm-${cluster.installation}-capa-controller`,
      },
    },
    {
      apiVersion: `${CONTROL_PLANE}/v1beta2`,
      kind: 'KubeadmControlPlane',
      metadata: metadata(cluster.name, { labels: clusterLabels }),
      spec: { version: `v${cluster.kubernetesVersion}` },
    },
  ];

  for (const pool of cluster.pools) {
    objects.push(
      {
        apiVersion: `${CAPI}/v1beta2`,
        kind: 'MachinePool',
        metadata: metadata(pool.name, { labels: clusterLabels }),
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
        metadata: metadata(pool.name, { labels: clusterLabels }),
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

const cache = new WeakMap<FixtureDataSet, Map<string, KubeObjectInterface[]>>();

/**
 * The Cluster API objects of an installation in fixture mode: per cluster of
 * the data set, its Cluster, AWSCluster, AWSClusterRoleIdentity,
 * KubeadmControlPlane, and a MachinePool and AWSMachinePool per node pool,
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
    objects = inInstallation(data.clusters, installation).flatMap(objectsOf);
    byInstallation.set(installation, objects);
  }
  return objects;
}
