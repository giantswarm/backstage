import type { Page } from '@playwright/test';

/**
 * cluster-manager 0.7.7's answers for the Add GPU node pool dialog, stubbed at
 * the browser: the lab has no cluster-manager (no Cluster API on a kind
 * cluster), so the muster calls the dialog makes are answered here in the
 * shapes `internal/tools/nodepool_write.go` produces, and the lab's muster
 * server list gains a `cluster-manager` entry so the page offers the dialog.
 *
 * The `sizes[]` shape of g6.xlarge and the "no serving preset is published"
 * note are a real dry run on gazelle (2026-09-17, `create_node_pool
 * nvidia-l4 [xlarge] dryRun`). The presets are the platform's nine
 * (`agent-platform-connectivity/files/model-serving/presets`) with their real
 * requests; their GPU-memory figures, the usable numbers of 2xlarge and
 * 4xlarge and the fit verdicts are synthetic — gazelle had no pool, so no
 * preset was published to judge (giantswarm/backstage#2413).
 */

export const CLUSTER = {
  name: 'wc1',
  namespace: 'org-lab',
  organization: 'lab',
  releaseVersion: '31.0.0',
  ownCluster: false,
  gpuOperator: { status: 'absent' },
  serving: { status: 'absent' },
  poolReleases: [],
  commitTarget: null,
};

const CLUSTER_API = {
  group: 'cluster.x-k8s.io',
  version: 'v1beta1',
  state: 'served',
};

export const INFO = {
  version: '0.7.7',
  modes: { apply: true, commit: false },
  tools: [
    'get_info',
    'list_clusters',
    'list_node_pools',
    'create_node_pool',
    'delete_node_pool',
  ],
  clusterApi: CLUSTER_API,
};

type Shape = {
  instanceType: string;
  size: string;
  vcpu: number;
  memoryGiB: number;
  gpus: number;
  gpuMemoryGiB: number;
  usableVcpu: number;
  usableMemoryGiB: number;
};

/** The g6 (L4) family as the chart's default sizes compose it, smallest first. */
export const SHAPES: Shape[] = [
  {
    instanceType: 'g6.xlarge',
    size: 'xlarge',
    vcpu: 4,
    memoryGiB: 16,
    gpus: 1,
    gpuMemoryGiB: 24,
    usableVcpu: 3,
    usableMemoryGiB: 11.9,
  },
  {
    instanceType: 'g6.2xlarge',
    size: '2xlarge',
    vcpu: 8,
    memoryGiB: 32,
    gpus: 1,
    gpuMemoryGiB: 24,
    usableVcpu: 6.5,
    usableMemoryGiB: 26.9,
  },
  {
    instanceType: 'g6.4xlarge',
    size: '4xlarge',
    vcpu: 16,
    memoryGiB: 64,
    gpus: 1,
    gpuMemoryGiB: 24,
    usableVcpu: 14.5,
    usableMemoryGiB: 58.4,
  },
];

type Preset = {
  preset: string;
  cpu: string;
  memory: string;
  gpus: number;
  gpuMemoryGiB: number;
};

/** The platform's presets: the two L4-class ones and the seven 128 GB ones. */
export const PRESETS: Preset[] = [
  {
    preset: 'qwen3-4b-instruct',
    cpu: '4',
    memory: '12Gi',
    gpus: 1,
    gpuMemoryGiB: 9.6,
  },
  {
    preset: 'qwen3-8b-fp8',
    cpu: '4',
    memory: '12Gi',
    gpus: 1,
    gpuMemoryGiB: 10.8,
  },
  {
    preset: 'devstral-small-2',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 57.6,
  },
  {
    preset: 'nemotron-3-super-nvfp4',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 90,
  },
  {
    preset: 'qwen3-14b',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 33.6,
  },
  {
    preset: 'qwen3-5-27b',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 64.8,
  },
  {
    preset: 'qwen3-5-35b-a3b',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 84,
  },
  {
    preset: 'qwen3-8-27b',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 62.4,
  },
  {
    preset: 'qwen3-coder-next',
    cpu: '8',
    memory: '64Gi',
    gpus: 1,
    gpuMemoryGiB: 96,
  },
];

/** The presets an L4 pool could serve at all — the ones a missing size warns about. */
export const L4_PRESETS = ['qwen3-4b-instruct', 'qwen3-8b-fp8'];

const gib = (memory: string) => Number(memory.replace(/Gi$/, ''));

/** `compose.Fit` as cluster-manager words it: the smallest size hosting the preset, or why none does. */
function fit(shapes: Shape[], preset: Preset) {
  const largest = SHAPES[SHAPES.length - 1];
  if (preset.gpuMemoryGiB > largest.gpuMemoryGiB) {
    return {
      reason: `needs ${preset.gpuMemoryGiB} GiB of GPU memory across ${preset.gpus} GPU(s); a g6 GPU has ${largest.gpuMemoryGiB} GiB`,
      hostable: false,
    };
  }
  const hosts = (shape: Shape) =>
    shape.usableVcpu >= Number(preset.cpu) &&
    shape.usableMemoryGiB >= gib(preset.memory);
  const host = shapes.find(hosts);
  if (host) {
    return { size: host.size, hostable: true };
  }
  const tight = shapes[shapes.length - 1];
  const would = SHAPES.find(hosts);
  const reason = `requests ${preset.cpu} vCPU / ${preset.memory}; ${tight.size} leaves a predictor ${tight.usableVcpu} vCPU / ${tight.usableMemoryGiB} GiB after the node's kubelet reservations and daemonsets`;
  return would
    ? {
        reason: `${reason} — ${would.size} (${would.vcpu} vCPU / ${would.memoryGiB} GiB) would host it`,
        hostable: true,
      }
    : { reason, hostable: false };
}

function objects(cluster: string, pool: string, action: string) {
  const release = (name: string, namespace: string) => [
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'OCIRepository',
      name,
      namespace,
      action,
    },
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      name,
      namespace,
      action,
    },
  ];
  return [
    ...release(`${cluster}-${pool}`, 'org-lab'),
    ...release(`${cluster}-agent-platform`, 'org-lab'),
    {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      name: 'model-backend-kserve',
      namespace: 'agent-platform',
      action,
    },
    ...release(`${cluster}-gpu-operator`, 'org-lab'),
  ];
}

export type DryRunOptions = {
  /** Whether the cluster publishes serving presets (a slice already on it). */
  presets?: boolean;
};

/** `create_node_pool` with `dryRun` for the chosen sizes (the chart's defaults when none). */
export function dryRunAnswer(
  pool: string,
  sizes: string[] | undefined,
  options: DryRunOptions = {},
) {
  const chosen = sizes
    ? SHAPES.filter(shape => sizes.includes(shape.size))
    : SHAPES;
  const judged = PRESETS.map(preset => {
    const { hostable, ...verdict } = fit(chosen, preset);
    return { entry: { ...preset, ...verdict }, hostable };
  });
  const warnings = judged
    .filter(({ entry, hostable }) => !entry.size && hostable)
    .map(
      ({ entry }) =>
        `serving preset ${entry.preset} fits no size of pool ${pool}: ${entry.reason} — a predictor composed from it would sit Pending while Karpenter refuses every size (giantswarm/agent-platform#502); add the size to sizes or serve a smaller preset`,
    );
  const presetFit =
    options.presets === false
      ? {
          note: `no serving preset is published on ${CLUSTER.name} yet — the slice release publishes them once it is ready; a dryRun re-run then says which of the pool's sizes host each`,
        }
      : {
          source: `${PRESETS.length} preset ConfigMap(s) in model-serving on ${CLUSTER.name}`,
          presets: judged.map(({ entry }) => entry),
        };
  return {
    cluster: CLUSTER.name,
    namespace: CLUSTER.namespace,
    pool,
    mode: 'apply',
    dryRun: true,
    chartVersion: '0.3.1',
    kubernetesVersion: '1.31.4',
    controlPlaneVersion: 'v1.31.4',
    machineImage: 'flatcar-stable-4152.2.3-kube-1.31.4-tooling-1.27.0-gs',
    objects: objects(CLUSTER.name, pool, 'would-create'),
    manifests: [
      {
        apiVersion: 'helm.toolkit.fluxcd.io/v2',
        kind: 'HelmRelease',
        metadata: { name: `${CLUSTER.name}-${pool}`, namespace: 'org-lab' },
        spec: {
          chart: { spec: { chart: 'gpu-node-pool', version: '0.3.1' } },
          values: { pool: { sizes: chosen.map(shape => shape.size) } },
        },
      },
    ],
    gpuOperator: { status: 'absent' },
    serving: { status: 'absent' },
    sizes: chosen,
    presetFit,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

/** The objects a partial apply leaves for the re-run: the last three. */
export const PENDING = 3;

/** `create_node_pool` with `mode: apply`: cut short (`partial`) or complete. */
export function applyAnswer(pool: string, partial: boolean) {
  const all = objects(CLUSTER.name, pool, 'created');
  const done = partial ? all.slice(0, all.length - PENDING) : all;
  const pending = partial
    ? all
        .slice(all.length - PENDING)
        .map(object => ({ ...object, action: 'pending' }))
    : [];
  return {
    cluster: CLUSTER.name,
    namespace: CLUSTER.namespace,
    pool,
    mode: 'apply',
    dryRun: false,
    chartVersion: '0.3.1',
    kubernetesVersion: '1.31.4',
    controlPlaneVersion: 'v1.31.4',
    objects: [...done, ...pending],
    ...(partial
      ? {
          partial: true,
          nextStep: `${PENDING} of ${all.length} object(s) are pending: the answer went out within the caller's deadline instead of starting them — re-run with the same arguments, the pending objects are written first`,
        }
      : {}),
  };
}

export type StubOptions = DryRunOptions & {
  /** How many applies answer `partial` before one completes. */
  partialApplies?: number;
};

export type RecordedCall = { name: string; arguments: Record<string, unknown> };

/**
 * Make the lab's muster appear to list cluster-manager and answer its tools
 * at the browser; everything else goes through. Returns the calls the dialog
 * made, in order, for assertions on what Deploy and Continue sent.
 */
export async function stubClusterManager(
  page: Page,
  options: StubOptions = {},
): Promise<RecordedCall[]> {
  const calls: RecordedCall[] = [];
  let applies = 0;

  // The page offers the dialog where the installation's muster lists
  // cluster-manager (`GET /api/muster/servers`, muster's core_mcpserver_list):
  // the lab's real list, plus that one entry.
  await page.route('**/api/muster/servers**', async route => {
    const response = await route.fetch();
    const body = (await response.json()) as {
      mcpServers?: { name: string }[] | null;
    };
    await route.fulfill({
      response,
      json: {
        ...body,
        mcpServers: [
          ...(body.mcpServers ?? []),
          {
            name: 'cluster-manager',
            type: 'streamable-http',
            state: 'ready',
            sessionStatus: 'authenticated',
            toolsCount: INFO.tools.length,
          },
        ],
      },
    });
  });

  await page.route('**/api/muster/call**', async route => {
    const body = route.request().postDataJSON() as RecordedCall;
    const tool = body?.name?.replace(/^x_cluster-manager_/, '');
    if (!body?.name || tool === body.name) {
      await route.continue();
      return;
    }
    calls.push({ name: body.name, arguments: body.arguments ?? {} });
    const args = body.arguments ?? {};
    switch (tool) {
      case 'get_info':
        await route.fulfill({ json: INFO });
        return;
      case 'list_clusters':
        await route.fulfill({
          json: { clusters: [CLUSTER], clusterApi: CLUSTER_API },
        });
        return;
      case 'list_node_pools':
        await route.fulfill({
          json: {
            cluster: CLUSTER.name,
            namespace: CLUSTER.namespace,
            controlPlaneVersion: 'v1.31.4',
            nodePools: [],
          },
        });
        return;
      case 'create_node_pool':
        if (args.dryRun) {
          await route.fulfill({
            json: dryRunAnswer(
              String(args.name),
              args.sizes as string[] | undefined,
              options,
            ),
          });
        } else {
          applies += 1;
          await route.fulfill({
            json: applyAnswer(
              String(args.name),
              applies <= (options.partialApplies ?? 0),
            ),
          });
        }
        return;
      default:
        await route.fulfill({
          status: 500,
          json: { error: `unexpected tool ${body.name}` },
        });
    }
  });

  return calls;
}
