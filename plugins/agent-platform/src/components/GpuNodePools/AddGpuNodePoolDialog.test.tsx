import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type {
  CacheSetting,
  InstanceShape,
  ManagedCluster,
  NodePoolWriteResult,
  PresetFit,
  PresetSizeFit,
} from '../../lib/clusterManager';
import type { ServeChoice } from '../../lib/serveIntent';
import {
  AddGpuNodePoolDialog,
  CLUSTER_PENDING,
  clusterMarks,
  SIZING_POOL_NAME,
} from './AddGpuNodePoolDialog';
import { FITS_NO_CHOSEN_SIZE } from './NodeSizePicker';
import {
  BILLED_STANDING,
  CACHE_OFF_COST,
  CACHE_OFF_NOTE,
  EVERY_ZONE,
  PICK_A_ZONE,
} from './PoolPlacementPicker';

jest.mock('../CodeBlock', () => ({
  CodeBlock: ({ filename, content }: { filename: string; content: string }) => (
    <pre data-testid={`code-${filename}`}>{content}</pre>
  ),
}));

const WC1: ManagedCluster = {
  name: 'wc1',
  namespace: 'org-acme',
  organization: 'acme',
  releaseVersion: '30.1.0',
  ownCluster: false,
  gpuOperator: { status: 'absent' },
  serving: { status: 'present', provider: 'chart' },
  poolReleases: [],
  commitTarget: {
    repository: 'https://github.com/acme/fleet',
    path: 'clusters/wc1',
  },
};

const DRY_RUN: NodePoolWriteResult = {
  cluster: 'wc1',
  namespace: 'org-acme',
  pool: 'gpu-l4',
  mode: 'apply',
  dryRun: true,
  chartVersion: '0.3.0',
  kubernetesVersion: '1.31.4',
  controlPlaneVersion: 'v1.31.4',
  objects: [
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'OCIRepository',
      name: 'wc1-gpu-l4',
      namespace: 'org-acme',
      action: 'would-create',
    },
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      name: 'wc1-gpu-l4',
      namespace: 'org-acme',
      action: 'would-create',
    },
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      name: 'wc1-gpu-operator',
      namespace: 'org-acme',
      action: 'would-create',
    },
  ],
  manifests: [
    {
      apiVersion: 'source.toolkit.fluxcd.io/v1',
      kind: 'OCIRepository',
      metadata: { name: 'wc1-gpu-l4', namespace: 'org-acme' },
    },
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: 'wc1-gpu-l4', namespace: 'org-acme' },
    },
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      metadata: { name: 'wc1-gpu-operator', namespace: 'org-acme' },
    },
  ],
  gpuOperator: { status: 'absent' },
};

type Scenario = {
  commit?: boolean;
  createError?: Error;
  /** The installation does not serve the Cluster API (cluster-manager 0.4.1+). */
  noClusterApi?: boolean;
  /** Nothing could be judged: `presetFit.note` alone, no presets. */
  noPresets?: boolean;
  /** No serving slice on the cluster yet: the presets the chart ships (`origin: chart`). */
  chartPresets?: boolean;
  /** The largest size is not offered in the region: `priceNote` instead of a price. */
  unpriced?: boolean;
  /** An older cluster-manager: no prices, no display names, no origin. */
  legacy?: boolean;
  /** The first apply is cut short (`partial`); the re-run completes. */
  partial?: boolean;
  /** cluster-manager 0.16+: `create_node_pool` takes `zones` and `cache`, `list_clusters` names the zones (giantswarm/backstage#2483). */
  placement?: boolean;
  /** The dry run is refused with a structured cache block (the zones named against a claim). */
  cacheRefusal?: boolean;
  /**
   * cluster-manager 0.17+: the dry run's cache block prices the claim, and
   * wc1's slice keeps a cache (`kept`) — the switch locks
   * (giantswarm/backstage#2493).
   */
  pricedCache?: boolean;
  keptCache?: boolean;
};

/** The kept claim wc1's slice mounts, as `list_clusters` reads it (cluster-manager 0.17+). */
const KEPT_CLAIM = {
  namespace: 'model-serving',
  name: 'hf-cache',
  phase: 'Bound',
  volume: 'pvc-1',
  zone: 'eu-central-1b',
  capacity: '100Gi',
  capacityGiB: 100,
  tier: { type: 'gp3', iops: 3000, throughputMiBps: 500 },
  created: '2026-09-18T20:31:04Z',
  price: {
    monthlyUSD: 27.37,
    source: 'AWS EBS gp3 list price, EU (Frankfurt) (eu-central-1)',
    asOf: '2026-09-19',
  },
  mounted: true,
};

/** wc1 as a cluster whose slice (cluster-manager's) runs with the cache on. */
const WC1_KEPT: ManagedCluster = {
  ...WC1,
  serving: {
    status: 'present',
    provider: 'cluster-manager',
    readiness: {
      release: null,
      children: [],
      controllers: [],
      configs: null,
      backend: {},
      presets: null,
      modelsGateway: null,
      cache: { enabled: true, claim: 'hf-cache' },
      cacheClaims: [KEPT_CLAIM],
    },
  },
};

/** The dry run's cache block priced from the chart's defaults (0.17+). */
const PRICED_CACHE = {
  exists: false,
  capacity: '100Gi',
  tier: 'gp3, 500 MiB/s, 3000 IOPS',
  monthlyPriceUSD: 27.37,
  priceSource: 'AWS EBS gp3 list price, EU (Frankfurt) (eu-central-1)',
  priceAsOf: '2026-09-19',
};

const ZONES = ['eu-central-1a', 'eu-central-1b', 'eu-central-1c'];

/** cluster-manager's word on the zones and the cache, as the dry run echoes the choice. */
function placementAnswer(args: Record<string, unknown>): {
  zones?: string[];
  zonesNote: string;
  cache: CacheSetting;
} {
  const zones = args.zones as string[] | undefined;
  const cache = args.cache !== false;
  return {
    ...(zones ? { zones } : {}),
    zonesNote: zones
      ? `nodes pinned to ${zones.join(', ')}, the zones named on create; ${
          cache
            ? 'the slice mounts the model cache claim model-serving/hf-cache, which does not exist yet'
            : 'this pool’s slice serves without the model cache (cache false), so no zone follows from a claim'
        }`
      : 'the pool’s nodes are not pinned to a zone',
    cache: cache
      ? {
          enabled: true,
          claim: 'model-serving/hf-cache',
          note: 'the predictors mount the model cache claim model-serving/hf-cache',
        }
      : {
          enabled: false,
          note: 'modelServing.cache.enabled false on the slice release: no claim is applied or mounted',
        },
  };
}

const CACHE_REFUSAL = {
  message:
    'zones eu-central-1a, eu-central-1c: the model cache claim model-serving/hf-cache on wc1 is bound to volume pvc-1 in eu-central-1b already, outside every zone named',
  refused: {
    nodes: [],
    models: [],
    hint: 'Name the claim’s zone among the zones, name one zone, or pass cache false, and re-run.',
    cacheZone: {
      claim: {
        namespace: 'model-serving',
        name: 'hf-cache',
        phase: 'Bound',
        volume: 'pvc-1',
        zone: 'eu-central-1b',
      },
      claimZone: 'eu-central-1b',
      zones: ['eu-central-1a', 'eu-central-1c'],
      remedies: [
        'name eu-central-1b among the zones — the pool then follows the claim there',
        'pass cache false, so this pool’s slice serves without the cache across the zones',
      ],
    },
  },
};

const PRICE_SOURCE =
  'AWS EC2 on-demand Linux list price, EU (Frankfurt) (eu-central-1)';
const PRICE_NOTE =
  'no on-demand price: AWS lists no on-demand g6.2xlarge in EU (Ireland) (eu-west-1) — the size is not offered there';

/** The g6 shapes of the chart's default sizes, priced as cluster-manager lists them. */
const SHAPES: InstanceShape[] = [
  {
    instanceType: 'g6.xlarge',
    size: 'xlarge',
    vcpu: 4,
    memoryGiB: 16,
    gpus: 1,
    gpuMemoryGiB: 24,
    usableVcpu: 3,
    usableMemoryGiB: 11.9,
    pricePerHourUSD: 1.0064,
    priceSource: PRICE_SOURCE,
    priceAsOf: '2026-09-17',
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
    pricePerHourUSD: 1.22249,
    priceSource: PRICE_SOURCE,
    priceAsOf: '2026-09-17',
  },
];

const SMALL_PRESET: PresetSizeFit = {
  preset: 'qwen3-4b-instruct',
  displayName: 'Qwen3 4B Instruct',
  model: 'Qwen/Qwen3-4B-Instruct-2507',
  cpu: '4',
  memory: '12Gi',
  gpus: 1,
  gpuMemoryGiB: 9.6,
};
const BIG_PRESET: PresetSizeFit = {
  preset: 'qwen3-coder-next',
  displayName: 'Qwen3 Coder Next',
  model: 'Qwen/Qwen3-Coder-Next-FP8',
  cpu: '8',
  memory: '64Gi',
  gpus: 1,
  gpuMemoryGiB: 96,
};
const TOO_SMALL =
  "requests 4 vCPU / 12Gi; xlarge leaves a predictor 3 vCPU / 11.9 GiB after the node's kubelet reservations and daemonsets — 2xlarge (8 vCPU / 32 GiB) would host it";
const GPU_MEMORY =
  'needs 96 GiB of GPU memory across 1 GPU(s); a g6 GPU has 24 GiB';
const CHART_SOURCE =
  '2 preset(s) shipped by agent-platform-connectivity 4.30.0, the chart the slice would resolve — the slice publishes them once it is ready';

/** The shapes as the scenario's cluster-manager lists them. */
function shapesOf(scenario: Scenario): InstanceShape[] {
  return SHAPES.map(shape => {
    if (scenario.legacy) {
      const { pricePerHourUSD, priceSource, priceAsOf, ...bare } = shape;
      return bare;
    }
    if (scenario.unpriced && shape.size === '2xlarge') {
      const { pricePerHourUSD, priceSource, priceAsOf, ...bare } = shape;
      return { ...bare, priceNote: PRICE_NOTE };
    }
    return shape;
  });
}

/** cluster-manager's fit for the chosen sizes (the defaults when none). */
function withFit(
  sizes: string[] | undefined,
  scenario: Scenario,
): NodePoolWriteResult {
  const shapes = shapesOf(scenario);
  const chosen = sizes
    ? shapes.filter(shape => sizes.includes(shape.size))
    : shapes;
  const hosts2xlarge = chosen.some(shape => shape.size === '2xlarge');
  const bare = (fit: PresetSizeFit): PresetSizeFit =>
    scenario.legacy ? (({ displayName, model, ...rest }) => rest)(fit) : fit;
  const small = hosts2xlarge
    ? { ...bare(SMALL_PRESET), size: '2xlarge' }
    : { ...bare(SMALL_PRESET), reason: TOO_SMALL };
  const presets = [small, { ...bare(BIG_PRESET), reason: GPU_MEMORY }];
  let presetFit: PresetFit;
  if (scenario.noPresets) {
    presetFit = { note: 'no serving preset is published on wc1 yet' };
  } else if (scenario.chartPresets) {
    presetFit = { origin: 'chart', source: CHART_SOURCE, presets };
  } else if (scenario.legacy) {
    presetFit = {
      source: '2 preset ConfigMap(s) in model-serving on wc1',
      presets,
    };
  } else {
    presetFit = {
      origin: 'published',
      source: '2 preset ConfigMap(s) in model-serving on wc1',
      presets,
    };
  }
  return {
    ...DRY_RUN,
    sizes: chosen,
    presetFit,
    ...(hosts2xlarge || scenario.noPresets
      ? {}
      : {
          warnings: [
            `serving preset qwen3-4b-instruct fits no size of pool gpu-l4: ${TOO_SMALL} — a predictor composed from it would sit Pending while Karpenter refuses every size (giantswarm/agent-platform#502); add the size to sizes or serve a smaller preset`,
          ],
        }),
  };
}

/** The apply: complete, or cut short with the operator's two objects pending. */
function applied(mode: unknown, partial: boolean): NodePoolWriteResult {
  const objects = DRY_RUN.objects.map((object, index) => ({
    ...object,
    action:
      partial && index >= DRY_RUN.objects.length - 2 ? 'pending' : 'created',
  }));
  return {
    ...DRY_RUN,
    dryRun: false,
    mode: mode as NodePoolWriteResult['mode'],
    objects,
    ...(partial
      ? {
          partial: true,
          nextStep:
            "2 of 3 object(s) are pending: the answer went out within the caller's deadline instead of starting them — re-run with the same arguments, the pending objects are written first",
        }
      : {}),
  };
}

const NO_CLUSTER_API = {
  group: 'cluster.x-k8s.io',
  version: 'v1beta1',
  state: 'absent',
  note: 'the Cluster API (cluster.x-k8s.io) is not served on this installation',
};

function makeMusterApi(scenario: Scenario = {}) {
  let applies = 0;
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      switch (name) {
        case 'x_cluster-manager_get_info':
          return {
            version: '0.4.0',
            modes: { apply: true, commit: scenario.commit ?? false },
            tools: [],
          };
        case 'x_cluster-manager_list_clusters':
          if (scenario.noClusterApi) {
            return { clusters: [], clusterApi: NO_CLUSTER_API };
          }
          return {
            clusters: scenario.placement
              ? [
                  { ...(scenario.keptCache ? WC1_KEPT : WC1), zones: ZONES },
                  { ...WC1, name: 'wc2', zones: ['eu-central-1a'] },
                ]
              : [WC1],
          };
        case 'x_cluster-manager_create_node_pool': {
          if (scenario.createError) {
            throw scenario.createError;
          }
          if (
            scenario.cacheRefusal &&
            Array.isArray(args.zones) &&
            !args.zones.includes('eu-central-1b') &&
            args.cache !== false
          ) {
            // The wire shape of a structured refusal: the block as `details`.
            throw Object.assign(new Error(CACHE_REFUSAL.message), {
              details: [JSON.stringify({ refused: CACHE_REFUSAL.refused })],
            });
          }
          const placement: Partial<ReturnType<typeof placementAnswer>> =
            scenario.placement ? placementAnswer(args) : {};
          if (scenario.pricedCache && placement.cache?.enabled) {
            placement.cache = { ...placement.cache, ...PRICED_CACHE };
          }
          if (args.dryRun) {
            return {
              ...withFit(args.sizes as string[] | undefined, scenario),
              ...placement,
            };
          }
          applies += 1;
          return {
            ...applied(args.mode, Boolean(scenario.partial) && applies === 1),
            ...placement,
          };
        }
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  const describeTool = jest.fn(async () =>
    scenario.placement
      ? {
          inputSchema: {
            properties: {
              cluster: { type: 'string' },
              zones: { type: 'array' },
              cache: { type: 'boolean' },
            },
          },
        }
      : { inputSchema: {} },
  );
  return { api: { callTool, describeTool } as unknown as MusterApi, callTool };
}

async function renderDialog(
  scenario: Scenario = {},
  onDeployed?: (
    result: NodePoolWriteResult,
    installation: string,
    serve?: ServeChoice,
  ) => void,
) {
  const { api, callTool } = makeMusterApi(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <AddGpuNodePoolDialog
          installations={['inst-1']}
          isOpen
          onOpenChange={() => {}}
          onDeployed={onDeployed}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

/**
 * The form asks cluster-manager DRY_RUN_DEBOUNCE_MS after the last change, and
 * the longer flows below change the sizes four or five times: on real timers
 * that is seconds of pure waiting per test, and under load the longest outgrow
 * Jest's per-test limit. On fake timers the wait is clock arithmetic: `findBy*`
 * and `waitFor` advance the fake clock while they poll, so a debounce and the
 * dry run behind it settle within one poll, whatever the machine is doing.
 */
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * user-event on fake timers, without its macrotask hop between two actions:
 * nothing moves the clock between a click and the test's next `findBy*` or
 * `waitFor`, so every deferred update (react-query's notifications, the write
 * hook settling) lands inside those, under act, and not between them.
 */
const setupUser = () => userEvent.setup({ delay: null });

/**
 * wc1 picked and the pool named: the form's dry run answers with the sizes.
 * The one cluster of an installation is picked as the form opens
 * (giantswarm/backstage#2501); among two, wc1 is picked by hand.
 */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  const clusterSelect = await screen.findByRole('button', {
    name: /^(Pick a cluster|wc1 \()/,
  });
  if (/^Pick a cluster/.test(clusterSelect.textContent ?? '')) {
    await user.click(clusterSelect);
    await user.click(await screen.findByRole('option', { name: /wc1/ }));
  }
  await user.type(screen.getByLabelText(/pool name/i), 'gpu-l4');
}

/** Review, once the form's dry run has answered. */
async function review(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole('button', { name: 'Review' });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await screen.findByTestId('node-pool-review');
}

async function fillAndReview(user: ReturnType<typeof userEvent.setup>) {
  await fillForm(user);
  await screen.findByTestId('node-size-picker');
  await review(user);
}

const dryRunsOf = (callTool: jest.Mock) =>
  callTool.mock.calls.filter(
    call =>
      call[0] === 'x_cluster-manager_create_node_pool' &&
      (call[1] as Record<string, unknown>).dryRun,
  );
const appliesOf = (callTool: jest.Mock) =>
  callTool.mock.calls.filter(
    call =>
      call[0] === 'x_cluster-manager_create_node_pool' &&
      !(call[1] as Record<string, unknown>).dryRun,
  );

/** The picker's checkbox for a size, by the instance type its label starts with. */
const sizeBox = (instanceType: string) =>
  within(screen.getByTestId('sizes-picker')).getByRole('checkbox', {
    name: new RegExp(`^${instanceType.replace('.', '\\.')} `),
  });

describe('AddGpuNodePoolDialog', () => {
  it('shows the marks of the picked cluster and renders the dry run as manifests', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog();
    await fillAndReview(user);

    expect(callTool).toHaveBeenCalledWith(
      'x_cluster-manager_create_node_pool',
      expect.objectContaining({
        cluster: 'wc1',
        namespace: 'org-acme',
        name: 'gpu-l4',
        dryRun: true,
        mode: 'apply',
      }),
      'inst-1',
    );
    expect(
      screen.getByTestId('code-helmrelease-wc1-gpu-l4.yaml'),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('code-helmrelease-wc1-gpu-operator.yaml'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/wc1-gpu-operator — the GPU operator/),
    ).toBeInTheDocument();
    expect(screen.getByText(/control plane v1\.31\.4/)).toBeInTheDocument();
  });

  it('Deploy calls create_node_pool with mode apply as the person', async () => {
    const user = setupUser();
    const onDeployed = jest.fn();
    const { callTool } = await renderDialog({}, onDeployed);
    await fillAndReview(user);
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await screen.findByText(/Pool wc1-gpu-l4 applied as you/);
    const deploy = callTool.mock.calls.find(
      call =>
        call[0] === 'x_cluster-manager_create_node_pool' &&
        !(call[1] as Record<string, unknown>).dryRun,
    );
    expect(deploy?.[1]).toMatchObject({
      mode: 'apply',
      cluster: 'wc1',
      name: 'gpu-l4',
    });
    // Without a preset chosen there is no serve intent.
    expect(onDeployed).toHaveBeenCalledTimes(1);
    expect(onDeployed.mock.calls[0][1]).toBe('inst-1');
    expect(onDeployed.mock.calls[0][2]).toBeUndefined();
  });

  it('Deploy hands the preset chosen under I want to serve on, with its display name and model', async () => {
    const user = setupUser();
    const onDeployed = jest.fn();
    await renderDialog({}, onDeployed);
    await fillForm(user);
    await screen.findByTestId('node-size-picker');
    await user.click(screen.getByRole('button', { name: /I want to serve/ }));
    await user.click(
      await screen.findByRole('option', { name: /Qwen3 4B Instruct/ }),
    );
    await review(user);
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await screen.findByText(/Pool wc1-gpu-l4 applied as you/);
    expect(onDeployed).toHaveBeenCalledWith(
      expect.objectContaining({ cluster: 'wc1', pool: 'gpu-l4' }),
      'inst-1',
      {
        preset: 'qwen3-4b-instruct',
        displayName: 'Qwen3 4B Instruct',
        model: 'Qwen/Qwen3-4B-Instruct-2507',
      },
    );
  });

  it('Commit is disabled with "not available yet" until cluster-manager offers it', async () => {
    const user = setupUser();
    await renderDialog({ commit: false });
    await fillAndReview(user);
    const commit = screen.getByRole('button', {
      name: /Commit \(not available yet\)/,
    });
    expect(commit).toBeDisabled();
    expect(
      screen.getByText(
        /is not available yet on this installation's cluster-manager/,
      ),
    ).toBeInTheDocument();
  });

  it('Commit calls mode commit once offered', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog({ commit: true });
    await fillAndReview(user);
    await user.click(screen.getByRole('button', { name: 'Commit' }));
    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_cluster-manager_create_node_pool',
        expect.objectContaining({ mode: 'commit' }),
        'inst-1',
      ),
    );
  });

  it('offers the muster connect step when the session is not connected', async () => {
    const user = setupUser();
    await renderDialog({
      createError: new Error(
        'tool not found: x_cluster-manager_create_node_pool',
      ),
    });
    await fillForm(user);
    // The form's own dry run meets the answer; no Review needed.
    expect(
      await screen.findByText('Connect to cluster-manager'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('node-size-picker')).not.toBeInTheDocument();
  });

  it("shows the tool's note, not an error, where the Cluster API is not served", async () => {
    await renderDialog({ noClusterApi: true });
    const note = await screen.findByTestId('cluster-api-note');
    expect(note).toHaveTextContent(NO_CLUSTER_API.note);
    expect(screen.queryByText('Clusters could not be read')).toBeNull();
    expect(
      screen.getByRole('button', { name: /^No clusters/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();
    expect(screen.getByTestId('sizes-pending')).toHaveTextContent(
      /pick a cluster/i,
    );
    expect(screen.getByTestId('cluster-marks')).toHaveTextContent(
      CLUSTER_PENDING,
    );
  });

  it('shows a refusal verbatim on the form, and Review tries once more', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog({
      createError: new Error(
        'pool gpu-l4 would run Kubernetes 1.32 ahead of the control plane 1.31',
      ),
    });
    await fillForm(user);
    const alert = await screen.findByText('cluster-manager refused');
    expect(
      within(alert.closest('[role="alert"]') ?? alert.parentElement!).getByText(
        /ahead of the control plane/,
      ),
    ).toBeInTheDocument();
    const before = dryRunsOf(callTool).length;
    const reviewButton = screen.getByRole('button', { name: 'Review' });
    await waitFor(() => expect(reviewButton).toBeEnabled());
    await user.click(reviewButton);
    await waitFor(() =>
      expect(dryRunsOf(callTool).length).toBeGreaterThan(before),
    );
    expect(screen.queryByTestId('node-pool-review')).not.toBeInTheDocument();
  });
});

describe('AddGpuNodePoolDialog: zones and model cache (giantswarm/backstage#2483)', () => {
  const zoneBox = (zone: string) =>
    within(screen.getByTestId('zones-picker')).getByRole('checkbox', {
      name: zone,
    });
  const cacheSwitch = () =>
    screen.getByRole('switch', { name: 'Keep a model cache' });

  it('offers every zone of the cluster chosen and the cache off by default; two zones and the cache on travel to the dry run, the review and Deploy', async () => {
    const user = setupUser();
    const onDeployed = jest.fn();
    const { callTool } = await renderDialog({ placement: true }, onDeployed);
    await fillForm(user);
    await screen.findByTestId('zones-picker');
    for (const zone of ZONES) {
      expect(zoneBox(zone)).toBeChecked();
    }
    expect(screen.getByTestId('zones-choice')).toHaveTextContent(EVERY_ZONE);
    expect(cacheSwitch()).not.toBeChecked();
    const consequence = screen.getByTestId('cache-consequence');
    expect(consequence).toHaveTextContent(CACHE_OFF_NOTE);
    expect(consequence).toHaveTextContent(CACHE_OFF_COST);
    expect(screen.queryByTestId('cache-cost')).not.toBeInTheDocument();
    // The defaults travel as such: every zone named, the cache off, explicitly.
    await waitFor(() => expect(dryRunsOf(callTool).length).toBeGreaterThan(0));
    expect(dryRunsOf(callTool)[0][1]).toMatchObject({
      zones: ZONES,
      cache: false,
    });

    await user.click(zoneBox('eu-central-1b'));
    await user.click(cacheSwitch());
    expect(screen.getByTestId('zones-choice')).toHaveTextContent(
      'The nodes launch in eu-central-1a, eu-central-1c only.',
    );
    // The cost is the switch's own line, from the dry run: this
    // cluster-manager prices nothing, and the line says so rather than
    // inventing a figure.
    await waitFor(() =>
      expect(screen.getByTestId('cache-cost')).toHaveTextContent(
        `Its price is not known — ${BILLED_STANDING}`,
      ),
    );
    expect(screen.getByTestId('cache-consequence')).toHaveTextContent(
      'Creates a cache claim. The download and the compile of every later start of the same model are saved.',
    );
    await waitFor(() =>
      expect(
        dryRunsOf(callTool).some(call =>
          expect
            .objectContaining({
              zones: ['eu-central-1a', 'eu-central-1c'],
              cache: true,
            })
            .asymmetricMatch(call[1]),
        ),
      ).toBe(true),
    );

    await review(user);
    const placement = screen.getByTestId('placement-review');
    expect(placement).toHaveTextContent('Zones: eu-central-1a, eu-central-1c.');
    expect(placement).not.toHaveTextContent('every zone of the cluster');
    expect(placement).toHaveTextContent('Model cache: on');
    expect(screen.getByTestId('review-zones-note')).toHaveTextContent(
      'nodes pinned to eu-central-1a, eu-central-1c, the zones named on create; the slice mounts the model cache claim model-serving/hf-cache',
    );
    expect(screen.getByTestId('review-cache-note')).toHaveTextContent(
      'the predictors mount the model cache claim model-serving/hf-cache',
    );

    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await screen.findByText(/Pool wc1-gpu-l4 applied as you/);
    expect(appliesOf(callTool)[0][1]).toMatchObject({
      mode: 'apply',
      zones: ['eu-central-1a', 'eu-central-1c'],
      cache: true,
    });
    expect(appliesOf(callTool)[0][1]).not.toHaveProperty('teleport');
    expect(onDeployed.mock.calls[0][0]).toMatchObject({
      zones: ['eu-central-1a', 'eu-central-1c'],
      cache: { enabled: true },
    });
  });

  it('every zone chosen, the review says so; none chosen holds Review until one is', async () => {
    const user = setupUser();
    await renderDialog({ placement: true });
    await fillForm(user);
    await screen.findByTestId('zones-picker');
    await review(user);
    expect(screen.getByTestId('placement-review')).toHaveTextContent(
      'Zones: eu-central-1a, eu-central-1b, eu-central-1c — every zone of the cluster.',
    );
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByTestId('zones-picker');
    for (const zone of ZONES) {
      await user.click(zoneBox(zone));
    }
    expect(screen.getByTestId('zones-choice')).toHaveTextContent(PICK_A_ZONE);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled(),
    );
    await user.click(zoneBox('eu-central-1c'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review' })).toBeEnabled(),
    );
  });

  it('another cluster: every zone of it is chosen anew; the cache choice stands', async () => {
    const user = setupUser();
    await renderDialog({ placement: true });
    await fillForm(user);
    await screen.findByTestId('zones-picker');
    await user.click(zoneBox('eu-central-1b'));
    await user.click(cacheSwitch());
    expect(zoneBox('eu-central-1b')).not.toBeChecked();
    // Another cluster: its zones are others, every one chosen again.
    await user.click(screen.getByRole('button', { name: /wc1/ }));
    await user.click(await screen.findByRole('option', { name: /wc2/ }));
    await waitFor(() => expect(zoneBox('eu-central-1a')).toBeChecked());
    expect(
      within(screen.getByTestId('zones-picker')).queryByRole('checkbox', {
        name: 'eu-central-1b',
      }),
    ).not.toBeInTheDocument();
    expect(cacheSwitch()).toBeChecked();
  });

  it('shows neither choice where cluster-manager takes neither argument, and sends nothing of them', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog();
    await fillForm(user);
    await screen.findByTestId('node-size-picker');
    expect(
      screen.queryByTestId('pool-placement-picker'),
    ).not.toBeInTheDocument();
    for (const call of dryRunsOf(callTool)) {
      expect(call[1]).not.toHaveProperty('zones');
      expect(call[1]).not.toHaveProperty('cache');
    }
    await review(user);
    expect(screen.queryByTestId('placement-review')).not.toBeInTheDocument();
  });

  it('renders a structured cache refusal with the claim and the ways out, and the form stays', async () => {
    const user = setupUser();
    await renderDialog({ placement: true, cacheRefusal: true });
    await fillForm(user);
    await screen.findByTestId('zones-picker');
    // The cache on and the claim's zone left out: refused, with the claim.
    await user.click(cacheSwitch());
    await user.click(zoneBox('eu-central-1b'));
    const refused = await screen.findByTestId('refused-cache');
    expect(refused).toHaveTextContent(
      'Claim model-serving/hf-cache (Bound in eu-central-1b), volume pvc-1',
    );
    expect(refused).toHaveTextContent(
      '· name eu-central-1b among the zones — the pool then follows the claim there',
    );
    expect(refused).toHaveTextContent('· pass cache false');
    expect(refused).toHaveTextContent('Name the claim’s zone among the zones');
    expect(screen.getByText(/outside every zone named/)).toBeInTheDocument();
    // The person names the claim's zone again; the next dry run is not refused.
    await user.click(zoneBox('eu-central-1b'));
    await waitFor(() =>
      expect(screen.queryByTestId('refused-cache')).not.toBeInTheDocument(),
    );
  });
});

describe('clusterMarks', () => {
  it('lists own cluster, the operator and serving providers and the commit target', () => {
    expect(clusterMarks(WC1)).toEqual([
      'Workload cluster',
      'GPU operator: absent',
      "Model serving: the platform's release",
      'Commit target: https://github.com/acme/fleet (clusters/wc1)',
    ]);
    expect(
      clusterMarks({ ...WC1, ownCluster: true, commitTarget: null })[0],
    ).toBe("The installation's own cluster");
  });
});

describe('AddGpuNodePoolDialog: node size and price on the form', () => {
  it('picks the one cluster as the form opens and offers the sizes and prices before the pool is named; the name only enables Review and relabels the dry run', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog();
    // The installation's one cluster is picked, nothing clicked: its marks
    // stand under the picker and the dry run runs.
    await waitFor(() =>
      expect(screen.getByTestId('cluster-marks')).toHaveTextContent(
        'Workload cluster · GPU operator: absent',
      ),
    );

    await screen.findByTestId('node-size-picker');
    expect(dryRunsOf(callTool)[0][1]).toMatchObject({
      cluster: 'wc1',
      name: SIZING_POOL_NAME,
      accelerator: 'nvidia-l4',
    });
    expect(sizeBox('g6.xlarge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();

    await user.click(sizeBox('g6.xlarge'));
    await user.type(screen.getByLabelText(/pool name/i), 'gpu-l4');
    const button = await screen.findByRole('button', { name: 'Review' });
    await waitFor(() => expect(button).toBeEnabled());
    const last = dryRunsOf(callTool).at(-1)?.[1];
    expect(last).toMatchObject({ name: 'gpu-l4', sizes: ['2xlarge'] });
    expect(sizeBox('g6.xlarge')).not.toBeChecked();
    expect(
      dryRunsOf(callTool).some(
        call => (call[1] as Record<string, unknown>).name === SIZING_POOL_NAME,
      ),
    ).toBe(true);
    expect(appliesOf(callTool)).toHaveLength(0);
  });

  it('offers the sizes with usable resources, GPU memory and price as soon as cluster and name are set, the cheapest as the from price', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog();
    await fillForm(user);

    const picker = await screen.findByTestId('node-size-picker');
    // The first dry run sends no sizes: the chart's defaults, every one preselected.
    expect(dryRunsOf(callTool)[0][1]).not.toHaveProperty('sizes');
    expect(dryRunsOf(callTool)[0][1]).toMatchObject({
      accelerator: 'nvidia-l4',
    });
    expect(picker).toHaveTextContent(
      'g6.xlarge — 3 vCPU / 11.9 GiB usable, 1 × 24 GiB GPU — $1.01/h',
    );
    expect(picker).toHaveTextContent(
      'g6.2xlarge — 6.5 vCPU / 26.9 GiB usable, 1 × 24 GiB GPU — $1.22/h',
    );
    expect(sizeBox('g6.xlarge')).toBeChecked();
    expect(sizeBox('g6.2xlarge')).toBeChecked();
    expect(screen.getByTestId('price-summary')).toHaveTextContent(
      'from $1.01/h per node (g6.xlarge) — the pool scales to zero',
    );
    expect(picker).toHaveTextContent(
      `Prices: ${PRICE_SOURCE}, as of 2026-09-17.`,
    );
    expect(screen.queryByTestId('node-pool-review')).not.toBeInTheDocument();

    // Unchecking the cheapest moves the from price; the dry run is re-judged against the choice.
    await user.click(sizeBox('g6.xlarge'));
    await waitFor(() =>
      expect(dryRunsOf(callTool).at(-1)?.[1]).toMatchObject({
        sizes: ['2xlarge'],
      }),
    );
    expect(screen.getByTestId('price-summary')).toHaveTextContent(
      'from $1.22/h per node (g6.2xlarge)',
    );

    // Review shows the same choice and Deploy sends it.
    await review(user);
    const chosen = screen.getByTestId('chosen-sizes');
    expect(chosen).toHaveTextContent('g6.2xlarge — 6.5 vCPU / 26.9 GiB usable');
    expect(chosen).not.toHaveTextContent('g6.xlarge —');
    expect(chosen).toHaveTextContent('from $1.22/h per node (g6.2xlarge)');
    expect(chosen).toHaveTextContent(
      'I want to serve: any preset — no preference',
    );
    const fit = screen.getByTestId('preset-fit');
    expect(fit).toHaveTextContent('Qwen3 4B Instruct');
    expect(fit).toHaveTextContent('Qwen/Qwen3-4B-Instruct-2507');
    expect(fit).toHaveTextContent('✔ 2xlarge');
    expect(fit).toHaveTextContent('g6.2xlarge — $1.22/h');
    expect(fit).toHaveTextContent(`✘ ${GPU_MEMORY}`);
    expect(screen.queryByTestId('sizes-picker')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await screen.findByText(/Pool wc1-gpu-l4 applied as you/);
    expect(appliesOf(callTool)[0][1]).toMatchObject({
      mode: 'apply',
      sizes: ['2xlarge'],
    });
  });

  it('marks a preset in the I want to serve list once the chosen sizes host it no more, with the size that would; the size back unmarks it; Back keeps the choice', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog();
    await fillForm(user);
    await screen.findByTestId('node-size-picker');

    await user.click(sizeBox('g6.2xlarge'));
    await waitFor(() =>
      expect(dryRunsOf(callTool).at(-1)?.[1]).toMatchObject({
        sizes: ['xlarge'],
      }),
    );
    // No alert wall: the list says how each preset fits the sizes as chosen.
    await user.click(screen.getByRole('button', { name: /I want to serve/ }));
    const marked = await screen.findByRole('option', {
      name: new RegExp(`Qwen3 4B Instruct${FITS_NO_CHOSEN_SIZE}`),
    });
    expect(marked).toHaveTextContent(
      'g6.2xlarge would host it — add it under Node size',
    );
    await user.click(screen.getByRole('option', { name: /Any preset/ }));

    // The size back: the mark goes, the smallest chosen size hosting it named.
    await user.click(sizeBox('g6.2xlarge'));
    await waitFor(() =>
      expect(dryRunsOf(callTool).at(-1)?.[1]).toMatchObject({
        sizes: ['xlarge', '2xlarge'],
      }),
    );
    await user.click(screen.getByRole('button', { name: /I want to serve/ }));
    const hosted = await screen.findByRole('option', {
      name: /Qwen3 4B Instruct/,
    });
    expect(hosted).not.toHaveTextContent(FITS_NO_CHOSEN_SIZE);
    expect(hosted).toHaveTextContent('from g6.2xlarge');
    await user.click(screen.getByRole('option', { name: /Any preset/ }));

    await user.click(sizeBox('g6.xlarge'));
    await waitFor(() =>
      expect(dryRunsOf(callTool).at(-1)?.[1]).toMatchObject({
        sizes: ['2xlarge'],
      }),
    );
    await review(user);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await screen.findByTestId('node-size-picker');
    expect(sizeBox('g6.xlarge')).not.toBeChecked();
    expect(sizeBox('g6.2xlarge')).toBeChecked();
    // No new dry run for coming back: the choice did not change.
    const runs = dryRunsOf(callTool).length;
    await review(user);
    expect(dryRunsOf(callTool).length).toBe(runs);
    expect(appliesOf(callTool)).toHaveLength(0);
  });

  it('choosing a preset preselects the smallest size hosting it with its price and marks the others; an unhosted preset blocks Deploy with the reason', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog();
    await fillForm(user);
    await screen.findByTestId('node-size-picker');

    await user.click(screen.getByRole('button', { name: /I want to serve/ }));
    const option = await screen.findByRole('option', {
      name: /Qwen3 4B Instruct/,
    });
    expect(option).toHaveTextContent('Qwen/Qwen3-4B-Instruct-2507');
    await user.click(option);

    await waitFor(() =>
      expect(dryRunsOf(callTool).at(-1)?.[1]).toMatchObject({
        sizes: ['2xlarge'],
      }),
    );
    expect(sizeBox('g6.2xlarge')).toBeChecked();
    expect(sizeBox('g6.xlarge')).not.toBeChecked();
    expect(sizeBox('g6.2xlarge')).toHaveAccessibleName(
      /hosts Qwen3 4B Instruct/,
    );
    expect(sizeBox('g6.xlarge')).toHaveAccessibleName(
      /does not host Qwen3 4B Instruct/,
    );
    expect(screen.getByTestId('price-summary')).toHaveTextContent(
      'from $1.22/h per node (g6.2xlarge)',
    );
    expect(screen.queryByTestId('deploy-blocked')).not.toBeInTheDocument();

    // Unchecking the hosting size blocks with the reason; the reason's size unblocks.
    await user.click(sizeBox('g6.2xlarge'));
    await user.click(sizeBox('g6.xlarge'));
    const blocked = await screen.findByTestId('deploy-blocked');
    expect(blocked).toHaveTextContent(
      'Deploy is blocked: Qwen3 4B Instruct fits no size of this pool',
    );
    expect(blocked).toHaveTextContent(TOO_SMALL);
    await user.click(
      within(blocked).getByRole('button', { name: 'Add 2xlarge' }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('deploy-blocked')).not.toBeInTheDocument(),
    );

    // A preset the accelerator cannot serve at all: the GPU-memory reason, no size to add, Deploy blocked on the review.
    await user.click(screen.getByRole('button', { name: /I want to serve/ }));
    await user.click(
      await screen.findByRole('option', { name: /Qwen3 Coder Next/ }),
    );
    const gpu = await screen.findByTestId('deploy-blocked');
    expect(gpu).toHaveTextContent(GPU_MEMORY);
    expect(
      within(gpu).queryByRole('button', { name: /^Add/ }),
    ).not.toBeInTheDocument();
    await review(user);
    expect(screen.getByTestId('chosen-sizes')).toHaveTextContent(
      'I want to serve: Qwen3 Coder Next (Qwen/Qwen3-Coder-Next-FP8)',
    );
    expect(screen.getByTestId('deploy-blocked')).toHaveTextContent(GPU_MEMORY);
    expect(
      screen.getByRole('button', { name: /^Deploy \(blocked/ }),
    ).toBeDisabled();
  });

  it('offers the presets the chart ships on a cluster without a serving slice', async () => {
    const user = setupUser();
    await renderDialog({ chartPresets: true });
    await fillForm(user);
    const picker = await screen.findByTestId('node-size-picker');
    expect(
      screen.getByRole('button', { name: /I want to serve/ }),
    ).toBeInTheDocument();
    expect(picker).toHaveTextContent(`Presets: ${CHART_SOURCE}.`);
    expect(screen.queryByTestId('preset-fit-note')).not.toBeInTheDocument();
  });

  it('shows the note instead of a picker where nothing could be judged', async () => {
    const user = setupUser();
    await renderDialog({ noPresets: true });
    await fillForm(user);
    await screen.findByTestId('node-size-picker');
    expect(screen.getByTestId('preset-fit-note')).toHaveTextContent(
      'no serving preset is published on wc1 yet',
    );
    // The picker stands in place, with nothing to pick.
    expect(
      screen.getByRole('button', { name: /I want to serve/ }),
    ).toBeDisabled();
    await review(user);
    expect(screen.queryByTestId('preset-fit')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeEnabled();
  });

  it('shows the price note where a size has no price, and prices nothing from an older cluster-manager', async () => {
    const user = setupUser();
    await renderDialog({ unpriced: true });
    await fillForm(user);
    const picker = await screen.findByTestId('node-size-picker');
    expect(picker).toHaveTextContent(`1 × 24 GiB GPU — ${PRICE_NOTE}`);
    expect(screen.getByTestId('price-summary')).toHaveTextContent(
      'from $1.01/h per node (g6.xlarge)',
    );
  });

  it('works without prices, display names and origin from an older cluster-manager', async () => {
    const user = setupUser();
    await renderDialog({ legacy: true });
    await fillForm(user);
    const picker = await screen.findByTestId('node-size-picker');
    expect(sizeBox('g6.xlarge')).toHaveAccessibleName(
      'g6.xlarge — 3 vCPU / 11.9 GiB usable, 1 × 24 GiB GPU',
    );
    expect(screen.queryByTestId('price-summary')).not.toBeInTheDocument();
    expect(picker).not.toHaveTextContent('Prices:');
    await user.click(screen.getByRole('button', { name: /I want to serve/ }));
    await user.click(
      await screen.findByRole('option', { name: 'qwen3-4b-instruct' }),
    );
    expect(sizeBox('g6.2xlarge')).toHaveAccessibleName(
      /hosts qwen3-4b-instruct/,
    );
    await review(user);
    expect(screen.getByTestId('preset-fit')).toHaveTextContent(
      'qwen3-coder-next',
    );
  });

  it('a Deploy cut short lists the pending objects and Continue re-runs the same call', async () => {
    const user = setupUser();
    const onDeployed = jest.fn();
    const { callTool } = await renderDialog({ partial: true }, onDeployed);
    await fillAndReview(user);
    await user.click(screen.getByRole('button', { name: 'Deploy' }));

    const partial = await screen.findByTestId('partial-write');
    expect(partial).toHaveTextContent(
      'Deploy was cut short: 2 of 3 objects are pending',
    );
    expect(partial).toHaveTextContent('re-run with the same arguments');
    expect(screen.getByTestId('pending-objects')).toHaveTextContent(
      'HelmRelease org-acme/wc1-gpu-operator: pending',
    );
    expect(
      screen.queryByRole('button', { name: 'Deploy' }),
    ).not.toBeInTheDocument();
    expect(onDeployed).not.toHaveBeenCalled();

    await user.click(within(partial).getByRole('button', { name: 'Continue' }));
    await screen.findByText(/Pool wc1-gpu-l4 applied as you/);
    const [first, second] = appliesOf(callTool);
    expect(second[1]).toEqual(first[1]);
    expect(first[1]).toMatchObject({ sizes: ['xlarge', '2xlarge'] });
    expect(onDeployed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('partial-write')).not.toBeInTheDocument();
  });
});

describe('AddGpuNodePoolDialog — the model cache’s standing cost (giantswarm/backstage#2493)', () => {
  it('the switch on: the price from the dry run is its own line — the claim the slice would create, its source, billed until the cache is removed; off again, what a cold start costs', async () => {
    const user = setupUser();
    await renderDialog({ placement: true, pricedCache: true });
    await fillForm(user);
    await screen.findByTestId('node-size-picker');
    expect(screen.queryByTestId('cache-cost')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('switch', { name: 'Keep a model cache' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('cache-cost')).toHaveTextContent(
        `$27.37/month at list prices — ${BILLED_STANDING}`,
      ),
    );
    expect(screen.getByTestId('cache-consequence')).toHaveTextContent(
      'Creates a cache claim (100Gi gp3, 500 MiB/s, 3000 IOPS). The download and the compile of every later start of the same model are saved.',
    );
    expect(screen.getByTestId('cache-price-source')).toHaveTextContent(
      'AWS EBS gp3 list price, EU (Frankfurt) (eu-central-1), as of 2026-09-19',
    );
    // Off: nothing stands, no claim exists to name, and what on would cost is said in words.
    await user.click(
      screen.getByRole('switch', { name: 'Keep a model cache' }),
    );
    await waitFor(() =>
      expect(screen.getByTestId('cache-consequence')).toHaveTextContent(
        `${CACHE_OFF_NOTE} ${CACHE_OFF_COST}`,
      ),
    );
    expect(screen.queryByTestId('cache-cost')).not.toBeInTheDocument();
    expect(screen.queryByTestId('cache-price-source')).not.toBeInTheDocument();
  });

  it('locks the switch on where the cluster’s slice keeps the cache, names the kept claim with its cost, and sends the cache on', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog({
      placement: true,
      keptCache: true,
    });
    await fillForm(user);
    await screen.findByTestId('node-size-picker');
    const cache = screen.getByRole('switch', { name: 'Keep a model cache' });
    expect(cache).toBeChecked();
    expect(cache).toBeDisabled();
    const kept = screen.getByTestId('cache-kept');
    expect(kept).toHaveTextContent(
      'This cluster keeps a model cache: every pool of the cluster serves from it, so a pool cannot switch it off. To serve without one, remove the cache under Model cache on the GPU capacity page.',
    );
    expect(kept).toHaveTextContent(
      'The cache: hf-cache — 100 GiB gp3 at 500 MiB/s · $27.37/month · since',
    );
    expect(kept).toHaveTextContent('Bound in eu-central-1b');
    expect(screen.queryByTestId('cache-consequence')).not.toBeInTheDocument();
    await waitFor(() => expect(dryRunsOf(callTool).length).toBeGreaterThan(0));
    for (const call of dryRunsOf(callTool)) {
      expect(call[1]).toMatchObject({ cache: true });
    }
  });
});

describe('AddGpuNodePoolDialog: the form stands in place (giantswarm/backstage#2501)', () => {
  it('renders every section before a cluster is picked — the sizes and zones as placeholders, the preset picker and the cache switch in place — and no Teleport field', async () => {
    await renderDialog({ placement: true });
    // Two clusters: none is picked for the person.
    await screen.findByRole('button', { name: /^Pick a cluster/ });
    expect(screen.getByTestId('cluster-marks')).toHaveTextContent(
      CLUSTER_PENDING,
    );
    expect(screen.getByTestId('node-size-pending')).toBeInTheDocument();
    expect(screen.getByTestId('sizes-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('sizes-pending')).toHaveTextContent(
      /Pick a cluster — the sizes for nvidia-l4/,
    );
    expect(
      screen.getByRole('button', { name: /I want to serve/ }),
    ).toBeDisabled();
    expect(screen.getByTestId('zones-placeholder')).toBeInTheDocument();
    expect(screen.getByTestId('zones-pending')).toBeInTheDocument();
    expect(
      screen.getByRole('switch', { name: 'Keep a model cache' }),
    ).not.toBeChecked();
    expect(screen.getByText('Maximum GPUs')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Teleport/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Teleport/)).not.toBeInTheDocument();
  });

  it('a picked cluster fills the sections in: its marks in one line, the sizes, the zones every one chosen', async () => {
    const user = setupUser();
    const { callTool } = await renderDialog({ placement: true });
    await fillForm(user);
    await screen.findByTestId('node-size-picker');
    expect(screen.queryByTestId('sizes-placeholder')).not.toBeInTheDocument();
    expect(screen.getByTestId('cluster-marks')).toHaveTextContent(
      "Workload cluster · GPU operator: absent · Model serving: the platform's release · Commit target: https://github.com/acme/fleet (clusters/wc1)",
    );
    expect(screen.getByTestId('zones-picker')).toBeInTheDocument();
    expect(screen.queryByTestId('zones-placeholder')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /I want to serve/ }),
    ).toBeEnabled();
    for (const call of dryRunsOf(callTool)) {
      expect(call[1]).not.toHaveProperty('teleport');
    }
  });
});
