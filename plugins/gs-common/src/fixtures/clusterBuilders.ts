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
import { createRandom, type FixtureRandom, hashOf } from './random';

/**
 * A cluster's lifecycle as the Clusters list derives it: `creating` until its
 * control plane is initialized, `deleting` once its deletion was requested.
 */
export const CLUSTER_STATES = ['ready', 'creating', 'deleting'] as const;
export type ClusterState = (typeof CLUSTER_STATES)[number];

/** A worker node of a node pool, as the node's metrics in Mimir describe it. */
export type FixtureClusterNode = {
  /** The EC2 private DNS name, `ip-10-0-41-12.eu-central-1.compute.internal`. */
  name: string;
  instanceType: string;
  /** The availability zone, `eu-central-1a`. */
  zone: string;
  capacityType: 'on-demand' | 'spot';
  ready: boolean;
  /** The node conditions other than Ready that are true, on a node not ready. */
  conditions: string[];
  /** Cores. */
  cpuCapacity: number;
  cpuAllocatable: number;
  cpuRequests: number;
  /** Bytes. */
  memoryCapacity: number;
  memoryAllocatable: number;
  memoryRequests: number;
  podsAllocatable: number;
  runningPods: number;
  createdAt: string;
};

type FixtureClusterPoolBase = {
  /** `<cluster>-<name>`, as the cluster chart names the MachinePool. */
  name: string;
  /** Desired nodes. */
  replicas: number;
  /** Nodes ready, those of `nodes` that are. */
  readyReplicas: number;
  nodes: FixtureClusterNode[];
  createdAt: string;
};

/**
 * A worker node pool of a cluster: a MachinePool and the infrastructure it
 * points at, an AWSMachinePool (an Auto Scaling group of one instance type)
 * or a KarpenterMachinePool (Karpenter picks the instances within its
 * requirements and limits).
 */
export type FixtureClusterPool = FixtureClusterPoolBase &
  (
    | {
        kind: 'machinePool';
        instanceType: string;
        /** Availability zones of the Auto Scaling group. */
        zones: string[];
        minSize: number;
        maxSize: number;
      }
    | {
        kind: 'karpenter';
        capacityTypes: ('spot' | 'on-demand')[];
        /** The zone requirement's values; undefined where the pool sets none. */
        zones: string[] | undefined;
        /** Instance families the pool excludes. */
        excludedFamilies: string[];
        limits: { cpu: number; memory: string };
        /** Nodes the disruption budgets allow to disrupt now. */
        allowedDisruptions: number;
      }
  );

/**
 * A Cluster API cluster in an installation (on AWS, `cluster-aws`): the
 * installation's management cluster, or a workload cluster of an
 * organization. The GPU clusters of model hosting are workload clusters too.
 */
export type FixtureCluster = {
  installation: string;
  name: string;
  kind: 'management' | 'workload';
  /** The infrastructure: Cluster API on AWS (CAPA) or on Azure (CAPZ). */
  provider: 'aws' | 'azure';
  /** The organization the cluster belongs to, `giantswarm` for the management cluster. */
  organization: string;
  state: ClusterState;
  description?: string;
  releaseVersion: string;
  kubernetesVersion: string;
  /** The `cluster-aws` chart version. */
  appVersion: string;
  /** The AWS region, or the Azure location. */
  region: string;
  /** Empty on Azure. */
  awsAccountId: string;
  servicePriority: 'highest' | 'medium' | 'lowest';
  createdAt: string;
  pools: FixtureClusterPool[];
  /**
   * The Git repository a Flux Kustomization applies the cluster's App from,
   * where the cluster is managed through GitOps.
   */
  gitOpsRepository?: string;
};

export type FixtureClusterSettings = {
  /**
   * The node pools of each installation's first ready workload cluster:
   * `pools` Auto Scaling group pools besides its Karpenter pool, of `nodes`
   * nodes each. Off by default.
   */
  busiestCluster?: { pools: number; nodes: number };
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

/**
 * A release's Kubernetes and app versions: the release it names, else the
 * newest one of its major version or below, so a GPU cluster's versions agree
 * with its release.
 */
function releaseOf(version: string): (typeof RELEASES)[number] {
  const exact = RELEASES.find(r => r.release === version);
  if (exact) {
    return exact;
  }
  const major = Number(version.split('.')[0]);
  return (
    [...RELEASES]
      .reverse()
      .find(r => Number(r.release.split('.')[0]) <= major) ?? RELEASES[0]
  );
}

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

/** The sizes of the instance types the fixture nodes run on. */
const MACHINE_SIZES: Record<string, { cpu: number; memoryGiB: number }> = {
  'm6i.xlarge': { cpu: 4, memoryGiB: 16 },
  'm6i.2xlarge': { cpu: 8, memoryGiB: 32 },
  'r6i.2xlarge': { cpu: 8, memoryGiB: 64 },
  'c5a.xlarge': { cpu: 4, memoryGiB: 8 },
  'c5ad.xlarge': { cpu: 4, memoryGiB: 8 },
  'c7i-flex.xlarge': { cpu: 4, memoryGiB: 8 },
  'm7i.2xlarge': { cpu: 8, memoryGiB: 32 },
  Standard_D4s_v5: { cpu: 4, memoryGiB: 16 },
  Standard_B8as_v2: { cpu: 8, memoryGiB: 32 },
};

/** The instance types Karpenter picks for the fixture pools. */
const KARPENTER_INSTANCE_TYPES = [
  'c5a.xlarge',
  'c5a.xlarge',
  'c5ad.xlarge',
  'c7i-flex.xlarge',
  'm7i.2xlarge',
];

/** Pods a node of an Auto Scaling group pool takes (the VPC CNI's limit). */
const ASG_MAX_PODS = 58;

/** Pods a node of an Azure pool takes (Azure CNI's default). */
const AZURE_MAX_PODS = 30;

/** Pods a node of a Karpenter pool takes: its `kubelet.maxPods`. */
export const KARPENTER_MAX_PODS = 110;

const GIB = 1024 ** 3;

/** What a pool's nodes are drawn from. */
type NodeSpec = {
  count: number;
  instanceTypes: readonly string[];
  zones: readonly string[];
  capacityTypes: readonly ('spot' | 'on-demand')[];
  maxPods: number;
  /** The earliest a node may have started, as ms. */
  since: number;
  /** The node's name; by default an EC2 private DNS name in the region. */
  nameOf?: (random: FixtureRandom, index: number) => string;
  /** The names the cluster's other nodes took: node names are unique in a cluster. */
  taken: Set<string>;
};

/**
 * The nodes of a pool, the last one not ready in about one pool of four with
 * three nodes or more, so the node table shows both.
 */
function nodesOf(
  context: BuilderContext,
  random: FixtureRandom,
  region: string,
  spec: NodeSpec,
): FixtureClusterNode[] {
  const notReady = spec.count >= 3 && random.int(0, 3) === 0;
  return Array.from({ length: spec.count }, (_, index) => {
    const instanceType = random.pick(spec.instanceTypes);
    const size = MACHINE_SIZES[instanceType] ?? { cpu: 4, memoryGiB: 16 };
    const cpuAllocatable = size.cpu - 0.08;
    const memoryAllocatable = Math.round(size.memoryGiB * GIB * 0.925);
    const ready = !(notReady && index === spec.count - 1);
    const ageDays = Math.max(
      1,
      Math.min(random.int(1, 30), Math.floor((context.now - spec.since) / DAY)),
    );
    let name: string;
    do {
      name = spec.nameOf
        ? spec.nameOf(random, index)
        : `ip-10-0-${random.int(32, 63)}-${random.int(2, 250)}.${region}.compute.internal`;
    } while (spec.taken.has(name));
    spec.taken.add(name);
    return {
      name,
      instanceType,
      zone: spec.zones[index % spec.zones.length],
      capacityType: spec.capacityTypes[index % spec.capacityTypes.length],
      ready,
      conditions: ready
        ? []
        : [random.pick(['MemoryPressure', 'DiskPressure'])],
      cpuCapacity: size.cpu,
      cpuAllocatable,
      cpuRequests:
        Math.round(cpuAllocatable * (0.35 + random.next() * 0.45) * 10) / 10,
      memoryCapacity: size.memoryGiB * GIB,
      memoryAllocatable,
      memoryRequests: Math.round(
        memoryAllocatable * (0.35 + random.next() * 0.45),
      ),
      podsAllocatable: spec.maxPods,
      runningPods: random.int(15, Math.min(45, spec.maxPods)),
      createdAt: isoAgo(context, ageDays * DAY - random.int(0, 23) * HOUR),
    };
  });
}

/** The availability zones of a region, `eu-central-1a` to `-c`. */
function zonesOf(region: string): string[] {
  return ['a', 'b', 'c'].map(letter => `${region}${letter}`);
}

/** An Auto Scaling group pool of `replicas` nodes of one instance type. */
function machinePool(
  context: BuilderContext,
  random: FixtureRandom,
  where: { region: string; since: number; taken: Set<string> },
  name: string,
  instanceType: string,
  replicas: number,
  azure = false,
): FixtureClusterPool {
  const zones = azure
    ? ['1', '2', '3'].map(zone => `${where.region}-${zone}`)
    : zonesOf(where.region);
  const nodes = nodesOf(context, random, where.region, {
    count: replicas,
    instanceTypes: [instanceType],
    zones,
    capacityTypes: ['on-demand'],
    maxPods: azure ? AZURE_MAX_PODS : ASG_MAX_PODS,
    since: where.since,
    taken: where.taken,
    ...(azure && {
      // A CAPZ machine's VM, named after its MachineDeployment.
      nameOf: (r: FixtureRandom) =>
        `${fitName(name, MAX_NAME_LENGTH - 12)}-${r
          .int(0, 36 ** 5 - 1)
          .toString(36)
          .padStart(5, '0')}`,
    }),
  });
  return {
    kind: 'machinePool',
    name,
    instanceType,
    zones,
    minSize: Math.min(3, replicas),
    maxSize: Math.max(replicas, 10),
    replicas,
    readyReplicas: nodes.filter(node => node.ready).length,
    nodes,
    createdAt: new Date(where.since).toISOString(),
  };
}

/** A Karpenter pool: spot and on-demand nodes of the types Karpenter picked. */
function karpenterPool(
  context: BuilderContext,
  random: FixtureRandom,
  where: { region: string; since: number; taken: Set<string> },
  name: string,
): FixtureClusterPool {
  const replicas = random.int(3, 8);
  const required = random.next() < 0.5;
  const allZones = zonesOf(where.region);
  const zones = required ? allZones.slice(0, 2) : undefined;
  const nodes = nodesOf(context, random, where.region, {
    count: replicas,
    instanceTypes: KARPENTER_INSTANCE_TYPES,
    zones: zones ?? allZones,
    capacityTypes: ['on-demand', 'spot'],
    maxPods: KARPENTER_MAX_PODS,
    since: where.since,
    taken: where.taken,
  });
  const cpu = nodes.reduce((sum, node) => sum + node.cpuCapacity, 0);
  const cpuLimit = cpu <= 48 ? 48 : 96;
  return {
    kind: 'karpenter',
    name,
    capacityTypes: ['spot', 'on-demand'],
    zones,
    excludedFamilies: ['t3', 't3a', 't2'],
    limits: { cpu: cpuLimit, memory: `${cpuLimit * 4}Gi` },
    allowedDisruptions: Math.max(1, Math.floor(replicas / 10)),
    replicas,
    readyReplicas: nodes.filter(node => node.ready).length,
    nodes,
    createdAt: new Date(where.since).toISOString(),
  };
}

/**
 * A cluster's node pools: `count` Auto Scaling group pools, whose instance
 * type and size draw from `context` as they always did, then, drawn from
 * the pool's own name so that adding them changed nothing else, their nodes,
 * `extra` more such pools and, with `karpenter`, a Karpenter pool.
 */
function pools(
  context: BuilderContext,
  cluster: {
    installation: string;
    name: string;
    region: string;
    createdAt: string;
  },
  state: ClusterState,
  count: number,
  options: { karpenter?: boolean; extra?: number; nodes?: number } = {},
): FixtureClusterPool[] {
  if (state === 'creating') {
    return [];
  }
  const where = {
    region: cluster.region,
    since: Date.parse(cluster.createdAt),
    taken: new Set<string>(),
  };
  const randomOf = (pool: string) =>
    createRandom(hashOf(`${cluster.installation}/${pool}`));
  const prefix = fitName(cluster.name, MAX_NAME_LENGTH - 7);
  const drawn = Array.from({ length: count }, (_, index) => ({
    name: `${fitName(cluster.name, MAX_NAME_LENGTH - 6)}-pool${index}`,
    instanceType: context.random.pick(INSTANCE_TYPES),
    replicas: context.random.int(2, 9),
  }));
  const result = drawn.map(pool =>
    machinePool(
      context,
      randomOf(pool.name),
      where,
      pool.name,
      pool.instanceType,
      options.nodes ?? pool.replicas,
    ),
  );
  for (let index = count; index < count + (options.extra ?? 0); index++) {
    const name = `${prefix}-pool${index}`;
    const random = randomOf(name);
    result.push(
      machinePool(
        context,
        random,
        where,
        name,
        random.pick(INSTANCE_TYPES),
        options.nodes ?? random.int(2, 9),
      ),
    );
  }
  if (options.karpenter) {
    const name = `${fitName(cluster.name, MAX_NAME_LENGTH - 5)}-spot`;
    result.push(karpenterPool(context, randomOf(name), where, name));
  }
  return result;
}

/**
 * The clusters of each installation: its management cluster, named after it,
 * then `count` workload clusters taking the states in turn, each of a ready
 * organization of its installation in turn (a made-up one where there is
 * none), on one of three releases (the oldest past its Kubernetes end of
 * life in `gs.kubernetesVersions` of the fixture config), every other one
 * managed through GitOps as the management clusters are, then the GPU
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
  // The cluster's creation time and its pools, drawn in that order.
  const placed = (
    cluster: Parameters<typeof pools>[1],
    state: ClusterState,
    count: number,
    options?: Parameters<typeof pools>[4],
  ) => ({
    createdAt: cluster.createdAt,
    pools: pools(context, cluster, state, count, options),
  });

  const management: FixtureCluster[] =
    settings.managementClusters === false
      ? []
      : installations.map(installation => ({
          installation: installation.name,
          name: installation.name,
          kind: 'management',
          provider: 'aws',
          organization: MANAGEMENT_ORGANIZATION,
          state: 'ready',
          releaseVersion: RELEASES[1].release,
          kubernetesVersion: RELEASES[1].kubernetes,
          appVersion: RELEASES[1].app,
          region: regionOf.get(installation.name) ?? REGIONS[0],
          awsAccountId: accountId(context),
          servicePriority: 'highest',
          ...placed(
            {
              installation: installation.name,
              name: installation.name,
              region: regionOf.get(installation.name) ?? REGIONS[0],
              createdAt: isoAgo(context, context.random.int(400, 900) * DAY),
            },
            'ready',
            2,
          ),
          gitOpsRepository: `${installation.name}-management-clusters`,
        }));

  // Each installation's first ready workload cluster is its busiest.
  const busiest = new Set<string>();
  const isBusiest = (installation: string, state: ClusterState) => {
    if (state !== 'ready' || busiest.has(installation)) {
      return false;
    }
    busiest.add(installation);
    return true;
  };

  const turns = new Map<string, number>();
  const organizationOf = (installation: string): string => {
    const ready = organizations.filter(
      o => o.installation === installation && o.state === 'ready',
    );
    const turn = turns.get(installation) ?? 0;
    turns.set(installation, turn + 1);
    return ready.length > 0 ? ready[turn % ready.length].name : name().name;
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
      const organization = organizationOf(installation.name);
      return {
        installation: installation.name,
        name: cluster.name,
        kind: 'workload',
        provider: 'aws',
        organization,
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
        ...placed(
          {
            installation: installation.name,
            name: cluster.name,
            region: regionOf.get(installation.name) ?? REGIONS[0],
            createdAt:
              state === 'creating'
                ? isoAgo(context, context.random.int(1, 6) * HOUR)
                : isoAgo(context, context.random.int(20, 700) * DAY),
          },
          state,
          1 + (index % 3),
          {
            // Every other workload cluster has a Karpenter pool too.
            karpenter: index % 2 === 1,
            ...(isBusiest(installation.name, state) &&
              settings.busiestCluster && {
                extra: settings.busiestCluster.pools - 1,
                nodes: settings.busiestCluster.nodes,
                karpenter: true,
              }),
          },
        ),
        // Every other one managed through GitOps, the rest applied by hand.
        ...(index % 2 === 0 && {
          gitOpsRepository: `${organization}-gitops`,
        }),
      };
    },
  );

  const gpu = gpuClusters.map((cluster): FixtureCluster => ({
    installation: cluster.installation,
    name: cluster.name,
    kind: 'workload',
    provider: 'aws',
    organization: cluster.organization,
    state: 'ready',
    description: 'GPU nodes for model hosting',
    releaseVersion: cluster.releaseVersion,
    kubernetesVersion: releaseOf(cluster.releaseVersion).kubernetes,
    appVersion: releaseOf(cluster.releaseVersion).app,
    region: regionOf.get(cluster.installation) ?? REGIONS[0],
    awsAccountId: accountId(context),
    servicePriority: 'medium',
    ...placed(
      {
        installation: cluster.installation,
        name: cluster.name,
        region: regionOf.get(cluster.installation) ?? REGIONS[0],
        createdAt: cluster.createdAt,
      },
      'ready',
      1,
    ),
  }));

  // One Azure (CAPZ) workload cluster per installation, drawn from its own
  // seed after everything else, so adding it changed no other cluster.
  const azure =
    settings.clusters?.count === 0
      ? []
      : installations.map((installation): FixtureCluster => {
          const random = createRandom(hashOf(`${installation.name}/azure`));
          const azureName = createNamer(random);
          // Unique in its installation, as cluster names are.
          const taken = new Set(
            [...management, ...workload, ...gpu]
              .filter(c => c.installation === installation.name)
              .map(c => c.name),
          );
          let cluster = azureName(settings.clusters?.nameLength);
          while (taken.has(cluster.name)) {
            cluster = azureName(settings.clusters?.nameLength);
          }
          const release = RELEASES[2];
          const organization =
            organizations.find(
              o => o.installation === installation.name && o.state === 'ready',
            )?.name ?? MANAGEMENT_ORGANIZATION;
          const createdAt = isoAgo(context, random.int(60, 400) * DAY);
          const where = {
            region: 'westeurope',
            since: Date.parse(createdAt),
            taken: new Set<string>(),
          };
          const poolNames = ['def00', 'big00'];
          return {
            installation: installation.name,
            name: cluster.name,
            kind: 'workload',
            provider: 'azure',
            organization,
            state: 'ready',
            description: `${cluster.displayName} on Azure`,
            releaseVersion: release.release,
            kubernetesVersion: release.kubernetes,
            appVersion: '1.4.0',
            region: where.region,
            awsAccountId: '',
            servicePriority: 'medium',
            createdAt,
            pools: poolNames.map((suffix, index) => {
              const poolName = `${fitName(cluster.name, MAX_NAME_LENGTH - 6)}-${suffix}`;
              return machinePool(
                context,
                createRandom(hashOf(`${installation.name}/${poolName}`)),
                where,
                poolName,
                index === 0 ? 'Standard_D4s_v5' : 'Standard_B8as_v2',
                index === 0 ? 3 : 2,
                true,
              );
            }),
          };
        });

  return [...management, ...workload, ...gpu, ...azure];
}
