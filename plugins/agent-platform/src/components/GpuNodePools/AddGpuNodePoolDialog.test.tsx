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
  InstanceShape,
  ManagedCluster,
  NodePoolWriteResult,
  PresetFit,
  PresetSizeFit,
} from '../../lib/clusterManager';
import type { ServeChoice } from '../../lib/serveIntent';
import {
  AddGpuNodePoolDialog,
  clusterMarks,
  SIZING_POOL_NAME,
} from './AddGpuNodePoolDialog';

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
          return scenario.noClusterApi
            ? { clusters: [], clusterApi: NO_CLUSTER_API }
            : { clusters: [WC1] };
        case 'x_cluster-manager_create_node_pool':
          if (scenario.createError) {
            throw scenario.createError;
          }
          if (args.dryRun) {
            return withFit(args.sizes as string[] | undefined, scenario);
          }
          applies += 1;
          return applied(args.mode, Boolean(scenario.partial) && applies === 1);
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  const describeTool = jest.fn(async () => ({ inputSchema: {} }));
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

/** The form waits after the last keystroke before it asks cluster-manager. */
const AFTER_DEBOUNCE = { timeout: 3000 };

/** Pick wc1 and name the pool: the form's dry run answers with the sizes. */
async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  const clusterSelect = await screen.findByRole('button', {
    name: /^Pick a cluster/,
  });
  await user.click(clusterSelect);
  await user.click(await screen.findByRole('option', { name: /wc1/ }));
  await user.type(screen.getByLabelText(/pool name/i), 'gpu-l4');
}

/** Review, once the form's dry run has answered. */
async function review(user: ReturnType<typeof userEvent.setup>) {
  const button = await screen.findByRole(
    'button',
    { name: 'Review' },
    AFTER_DEBOUNCE,
  );
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await screen.findByTestId('node-pool-review');
}

async function fillAndReview(user: ReturnType<typeof userEvent.setup>) {
  await fillForm(user);
  await screen.findByTestId('node-size-picker', {}, AFTER_DEBOUNCE);
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    const onDeployed = jest.fn();
    await renderDialog({}, onDeployed);
    await fillForm(user);
    await screen.findByTestId('node-size-picker', {}, AFTER_DEBOUNCE);
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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
    const user = userEvent.setup();
    await renderDialog({
      createError: new Error(
        'tool not found: x_cluster-manager_create_node_pool',
      ),
    });
    await fillForm(user);
    // The form's own dry run meets the answer; no Review needed.
    expect(
      await screen.findByText('Connect to cluster-manager', {}, AFTER_DEBOUNCE),
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
      'pick a cluster',
    );
  });

  it('shows a refusal verbatim on the form, and Review tries once more', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog({
      createError: new Error(
        'pool gpu-l4 would run Kubernetes 1.32 ahead of the control plane 1.31',
      ),
    });
    await fillForm(user);
    const alert = await screen.findByText(
      'cluster-manager refused',
      {},
      AFTER_DEBOUNCE,
    );
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
  it('offers the sizes and prices as soon as a cluster is picked, before the pool is named; the name only enables Review and relabels the dry run', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog();
    await user.click(
      await screen.findByRole('button', { name: /^Pick a cluster/ }),
    );
    await user.click(await screen.findByRole('option', { name: /wc1/ }));

    await screen.findByTestId('node-size-picker', {}, AFTER_DEBOUNCE);
    expect(dryRunsOf(callTool)[0][1]).toMatchObject({
      cluster: 'wc1',
      name: SIZING_POOL_NAME,
      accelerator: 'nvidia-l4',
    });
    expect(sizeBox('g6.xlarge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review' })).toBeDisabled();

    await user.click(sizeBox('g6.xlarge'));
    await user.type(screen.getByLabelText(/pool name/i), 'gpu-l4');
    const button = await screen.findByRole(
      'button',
      { name: 'Review' },
      AFTER_DEBOUNCE,
    );
    await waitFor(() => expect(button).toBeEnabled(), AFTER_DEBOUNCE);
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
    const user = userEvent.setup();
    const { callTool } = await renderDialog();
    await fillForm(user);

    const picker = await screen.findByTestId(
      'node-size-picker',
      {},
      AFTER_DEBOUNCE,
    );
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

  it('warns on the form when a chosen set hosts a preset no more; Add puts the size back; Back keeps the choice', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog();
    await fillForm(user);
    await screen.findByTestId('node-size-picker', {}, AFTER_DEBOUNCE);

    await user.click(sizeBox('g6.2xlarge'));
    const warnings = await screen.findByTestId('fit-warnings');
    expect(dryRunsOf(callTool).at(-1)?.[1]).toMatchObject({
      sizes: ['xlarge'],
    });
    expect(warnings).toHaveTextContent(
      '1 preset fits no size of this pool — Deploy is not blocked',
    );
    expect(warnings).toHaveTextContent(TOO_SMALL);

    await user.click(
      within(warnings).getByRole('button', { name: 'Add 2xlarge' }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('fit-warnings')).not.toBeInTheDocument(),
    );
    expect(sizeBox('g6.2xlarge')).toBeChecked();

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
    const user = userEvent.setup();
    const { callTool } = await renderDialog();
    await fillForm(user);
    await screen.findByTestId('node-size-picker', {}, AFTER_DEBOUNCE);

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
    expect(screen.queryByTestId('fit-warnings')).not.toBeInTheDocument();

    // Unchecking the hosting size blocks with the reason; the reason's size unblocks.
    await user.click(sizeBox('g6.2xlarge'));
    await user.click(sizeBox('g6.xlarge'));
    const blocked = await screen.findByTestId('deploy-blocked');
    expect(blocked).toHaveTextContent(
      'Deploy is blocked: Qwen3 4B Instruct fits no size of this pool',
    );
    expect(blocked).toHaveTextContent(TOO_SMALL);
    expect(screen.queryByTestId('fit-warnings')).not.toBeInTheDocument();
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
    const user = userEvent.setup();
    await renderDialog({ chartPresets: true });
    await fillForm(user);
    const picker = await screen.findByTestId(
      'node-size-picker',
      {},
      AFTER_DEBOUNCE,
    );
    expect(
      screen.getByRole('button', { name: /I want to serve/ }),
    ).toBeInTheDocument();
    expect(picker).toHaveTextContent(`Presets: ${CHART_SOURCE}.`);
    expect(screen.queryByTestId('preset-fit-note')).not.toBeInTheDocument();
  });

  it('shows the note instead of a picker where nothing could be judged', async () => {
    const user = userEvent.setup();
    await renderDialog({ noPresets: true });
    await fillForm(user);
    await screen.findByTestId('node-size-picker', {}, AFTER_DEBOUNCE);
    expect(screen.getByTestId('preset-fit-note')).toHaveTextContent(
      'no serving preset is published on wc1 yet',
    );
    expect(
      screen.queryByRole('button', { name: /I want to serve/ }),
    ).not.toBeInTheDocument();
    await review(user);
    expect(screen.queryByTestId('preset-fit')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeEnabled();
  });

  it('shows the price note where a size has no price, and prices nothing from an older cluster-manager', async () => {
    const user = userEvent.setup();
    await renderDialog({ unpriced: true });
    await fillForm(user);
    const picker = await screen.findByTestId(
      'node-size-picker',
      {},
      AFTER_DEBOUNCE,
    );
    expect(picker).toHaveTextContent(`1 × 24 GiB GPU — ${PRICE_NOTE}`);
    expect(screen.getByTestId('price-summary')).toHaveTextContent(
      'from $1.01/h per node (g6.xlarge)',
    );
  });

  it('works without prices, display names and origin from an older cluster-manager', async () => {
    const user = userEvent.setup();
    await renderDialog({ legacy: true });
    await fillForm(user);
    const picker = await screen.findByTestId(
      'node-size-picker',
      {},
      AFTER_DEBOUNCE,
    );
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
    const user = userEvent.setup();
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
