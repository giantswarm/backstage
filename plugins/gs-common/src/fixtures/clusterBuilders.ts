import {
  type BuilderContext,
  type BuilderSettings,
  DAY,
  each,
  type FixtureInstallation,
  type FixtureOrganization,
  HOUR,
  isoAgo,
} from './builders';
import type { FixtureGpuCluster } from './hostingBuilders';
import { createNamer, fitName, MAX_NAME_LENGTH } from './names';

/**
 * A cluster's lifecycle as the Clusters list derives it: `creating` until its
 * control plane is initialized, `deleting` once its deletion was requested.
 */
export const CLUSTER_STATES = ['ready', 'creating', 'deleting'] as const;
export type ClusterState = (typeof CLUSTER_STATES)[number];

/** A worker node pool of a cluster: a MachinePool and its AWSMachinePool. */
export type FixtureClusterPool = {
  /** `<cluster>-<name>`, as the cluster chart names the MachinePool. */
  name: string;
  instanceType: string;
  /** Ready nodes. */
  replicas: number;
};

/**
 * A Cluster API cluster in an installation (on AWS, `cluster-aws`): the
 * installation's management cluster, or a workload cluster of an
 * organization. The GPU clusters of model hosting are workload clusters too.
 */
export type FixtureCluster = {
  installation: string;
  name: string;
  kind: 'management' | 'workload';
  /** The organization the cluster belongs to, `giantswarm` for the management cluster. */
  organization: string;
  state: ClusterState;
  description?: string;
  releaseVersion: string;
  kubernetesVersion: string;
  /** The `cluster-aws` chart version. */
  appVersion: string;
  region: string;
  awsAccountId: string;
  servicePriority: 'highest' | 'medium' | 'lowest';
  createdAt: string;
  pools: FixtureClusterPool[];
};

export type FixtureClusterSettings = {
  /** Workload clusters per installation, besides the GPU clusters. */
  clusters?: BuilderSettings<ClusterState>;
  /**
   * Whether each installation has its management cluster. Off in `empty`,
   * so the list has nothing in it.
   */
  managementClusters?: boolean;
};

/** Releases and the Kubernetes version each runs, oldest first. */
const RELEASES = [
  { release: '30.1.2', kubernetes: '1.30.11', app: '3.2.0' },
  { release: '31.1.0', kubernetes: '1.31.7', app: '3.4.1' },
  { release: '32.0.0', kubernetes: '1.32.3', app: '3.5.0' },
];

const REGIONS = ['eu-central-1', 'eu-west-1', 'us-east-1'];

const INSTANCE_TYPES = ['m6i.xlarge', 'm6i.2xlarge', 'r6i.2xlarge'];

const PRIORITIES: FixtureCluster['servicePriority'][] = [
  'highest',
  'medium',
  'lowest',
];

/** The management clusters' organization, as Giant Swarm names it. */
export const MANAGEMENT_ORGANIZATION = 'giantswarm';

function accountId(context: BuilderContext): string {
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += context.random.int(0, 9);
  }
  return id;
}

function pools(
  context: BuilderContext,
  cluster: string,
  state: ClusterState,
  count: number,
): FixtureClusterPool[] {
  if (state === 'creating') {
    return [];
  }
  return Array.from({ length: count }, (_, index) => ({
    name: `${fitName(cluster, MAX_NAME_LENGTH - 6)}-pool${index}`,
    instanceType: context.random.pick(INSTANCE_TYPES),
    replicas: context.random.int(2, 9),
  }));
}

/**
 * The clusters of each installation: its management cluster, named after it,
 * then `count` workload clusters taking the states in turn, each of a ready
 * organization of its installation in turn (a made-up one where there is
 * none), on one of three releases (the oldest past its Kubernetes end of
 * life in `gs.kubernetesVersions` of the fixture config), then the GPU
 * clusters model hosting serves from.
 */
export function buildClusters(
  context: BuilderContext,
  installations: readonly FixtureInstallation[],
  organizations: readonly FixtureOrganization[],
  gpuClusters: readonly FixtureGpuCluster[],
  settings: FixtureClusterSettings = {},
): FixtureCluster[] {
  const name = createNamer(context.random);
  const regionOf = new Map(
    installations.map((installation, index) => [
      installation.name,
      REGIONS[index % REGIONS.length],
    ]),
  );
  const management: FixtureCluster[] =
    settings.managementClusters === false
      ? []
      : installations.map(installation => ({
          installation: installation.name,
          name: installation.name,
          kind: 'management',
          organization: MANAGEMENT_ORGANIZATION,
          state: 'ready',
          releaseVersion: RELEASES[1].release,
          kubernetesVersion: RELEASES[1].kubernetes,
          appVersion: RELEASES[1].app,
          region: regionOf.get(installation.name) ?? REGIONS[0],
          awsAccountId: accountId(context),
          servicePriority: 'highest',
          createdAt: isoAgo(context, context.random.int(400, 900) * DAY),
          pools: pools(context, installation.name, 'ready', 2),
        }));

  const turns = new Map<string, number>();
  const organizationOf = (installation: string): string => {
    const ready = organizations.filter(
      o => o.installation === installation && o.state === 'ready',
    );
    const turn = turns.get(installation) ?? 0;
    turns.set(installation, turn + 1);
    return ready.length > 0
      ? ready[turn % ready.length].name
      : `org-${name().name}`;
  };

  const workload = each(
    installations,
    settings.clusters ?? {},
    {
      count: 6,
      states: ['ready', 'ready', 'creating', 'ready', 'ready', 'deleting'],
    },
    (installation, state, nameLength, index): FixtureCluster => {
      const cluster = name(nameLength);
      const release = RELEASES[index % RELEASES.length];
      return {
        installation: installation.name,
        name: cluster.name,
        kind: 'workload',
        organization: organizationOf(installation.name),
        state,
        ...(index % 3 === 0 && {
          description: `${cluster.displayName} workloads`,
        }),
        releaseVersion: release.release,
        kubernetesVersion: release.kubernetes,
        appVersion: release.app,
        region: regionOf.get(installation.name) ?? REGIONS[0],
        awsAccountId: accountId(context),
        servicePriority: PRIORITIES[index % PRIORITIES.length],
        createdAt:
          state === 'creating'
            ? isoAgo(context, context.random.int(1, 6) * HOUR)
            : isoAgo(context, context.random.int(20, 700) * DAY),
        pools: pools(context, cluster.name, state, 1 + (index % 3)),
      };
    },
  );

  const gpu = gpuClusters.map((cluster): FixtureCluster => ({
    installation: cluster.installation,
    name: cluster.name,
    kind: 'workload',
    organization: cluster.organization,
    state: 'ready',
    description: 'GPU nodes for model hosting',
    releaseVersion: cluster.releaseVersion,
    kubernetesVersion: RELEASES[1].kubernetes,
    appVersion: RELEASES[1].app,
    region: regionOf.get(cluster.installation) ?? REGIONS[0],
    awsAccountId: accountId(context),
    servicePriority: 'medium',
    createdAt: cluster.createdAt,
    pools: pools(context, cluster.name, 'ready', 1),
  }));

  return [...management, ...workload, ...gpu];
}
