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
} from '../../lib/clusterManager';
import { AddGpuNodePoolDialog, clusterMarks } from './AddGpuNodePoolDialog';

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
  /** The cluster publishes no serving presets: `presetFit.note` instead of a table. */
  noPresets?: boolean;
  /** The first apply is cut short (`partial`); the re-run completes. */
  partial?: boolean;
};

/** The g6 shapes of the chart's default sizes the fixture knows (giantswarm/backstage#2413). */
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
];

const SMALL_PRESET = {
  preset: 'qwen3-4b-instruct',
  cpu: '4',
  memory: '12Gi',
  gpus: 1,
  gpuMemoryGiB: 9.6,
};
const BIG_PRESET = {
  preset: 'qwen3-coder-next',
  cpu: '8',
  memory: '64Gi',
  gpus: 1,
  gpuMemoryGiB: 96,
};
const TOO_SMALL =
  "requests 4 vCPU / 12Gi; xlarge leaves a predictor 3 vCPU / 11.9 GiB after the node's kubelet reservations and daemonsets — 2xlarge (8 vCPU / 32 GiB) would host it";
const GPU_MEMORY =
  'needs 96 GiB of GPU memory across 1 GPU(s); a g6 GPU has 24 GiB';

/** cluster-manager's fit for the chosen sizes (the defaults when none). */
function withFit(
  sizes: string[] | undefined,
  scenario: Scenario,
): NodePoolWriteResult {
  const chosen = sizes
    ? SHAPES.filter(shape => sizes.includes(shape.size))
    : SHAPES;
  const hosts2xlarge = chosen.some(shape => shape.size === '2xlarge');
  const small = hosts2xlarge
    ? { ...SMALL_PRESET, size: '2xlarge' }
    : { ...SMALL_PRESET, reason: TOO_SMALL };
  return {
    ...DRY_RUN,
    sizes: chosen,
    presetFit: scenario.noPresets
      ? { note: 'no serving preset is published on wc1 yet' }
      : {
          source: '2 preset ConfigMap(s) in model-serving on wc1',
          presets: [small, { ...BIG_PRESET, reason: GPU_MEMORY }],
        },
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
  onDeployed?: (result: NodePoolWriteResult) => void,
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

async function fillAndReview(user: ReturnType<typeof userEvent.setup>) {
  const clusterSelect = await screen.findByRole('button', {
    name: /^Pick a cluster/,
  });
  await user.click(clusterSelect);
  await user.click(await screen.findByRole('option', { name: /wc1/ }));
  await user.type(screen.getByLabelText(/pool name/i), 'gpu-l4');
  await user.click(screen.getByRole('button', { name: 'Review' }));
  await screen.findByTestId('node-pool-review');
}

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
    const { callTool } = await renderDialog();
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
    const clusterSelect = await screen.findByRole('button', {
      name: /^Pick a cluster/,
    });
    await user.click(clusterSelect);
    await user.click(await screen.findByRole('option', { name: /wc1/ }));
    await user.type(screen.getByLabelText(/pool name/i), 'gpu-l4');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(
      await screen.findByText('Connect to cluster-manager'),
    ).toBeInTheDocument();
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
  });

  it('shows a refusal verbatim', async () => {
    const user = userEvent.setup();
    await renderDialog({
      createError: new Error(
        'pool gpu-l4 would run Kubernetes 1.32 ahead of the control plane 1.31',
      ),
    });
    const clusterSelect = await screen.findByRole('button', {
      name: /^Pick a cluster/,
    });
    await user.click(clusterSelect);
    await user.click(await screen.findByRole('option', { name: /wc1/ }));
    await user.type(screen.getByLabelText(/pool name/i), 'gpu-l4');
    await user.click(screen.getByRole('button', { name: 'Review' }));
    const alert = await screen.findByText('cluster-manager refused');
    expect(
      within(alert.closest('[role="alert"]') ?? alert.parentElement!).getByText(
        /ahead of the control plane/,
      ),
    ).toBeInTheDocument();
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

describe('AddGpuNodePoolDialog: what this pool can serve', () => {
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

  it('shows the shapes and the presets each size hosts, and re-judges the dry run when a size is unchecked', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog();
    await fillAndReview(user);

    expect(screen.getByText('What this pool can serve')).toBeInTheDocument();
    const picker = screen.getByTestId('sizes-picker');
    expect(picker).toHaveTextContent(
      'g6.xlarge — 3 vCPU / 11.9 GiB usable, 1 × 24 GiB GPU',
    );
    const fit = screen.getByTestId('preset-fit');
    expect(fit).toHaveTextContent('✔ 2xlarge');
    expect(fit).toHaveTextContent(`✘ ${GPU_MEMORY}`);
    expect(screen.queryByTestId('fit-warnings')).not.toBeInTheDocument();
    // The first dry run sends no sizes: the chart's defaults.
    expect(dryRunsOf(callTool)[0][1]).not.toHaveProperty('sizes');

    await user.click(
      within(picker).getByRole('checkbox', { name: /g6\.2xlarge/ }),
    );
    const warnings = await screen.findByTestId('fit-warnings');
    expect(dryRunsOf(callTool).at(-1)?.[1]).toMatchObject({
      sizes: ['xlarge'],
    });
    expect(warnings).toHaveTextContent(
      '1 preset fits no size of this pool — Deploy is not blocked',
    );
    expect(warnings).toHaveTextContent(TOO_SMALL);
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeEnabled();

    // The warning's own fix puts the size back, and Deploy sends the sizes as reviewed.
    await user.click(
      within(warnings).getByRole('button', { name: 'Add 2xlarge' }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('fit-warnings')).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Deploy' }));
    await screen.findByText(/Pool wc1-gpu-l4 applied as you/);
    expect(appliesOf(callTool)[0][1]).toMatchObject({
      mode: 'apply',
      sizes: ['xlarge', '2xlarge'],
    });
  });

  it('the preset the person wants to serve blocks Deploy when no size hosts it', async () => {
    const user = userEvent.setup();
    await renderDialog();
    await fillAndReview(user);
    const picker = screen.getByTestId('sizes-picker');
    await user.click(
      within(picker).getByRole('checkbox', { name: /g6\.2xlarge/ }),
    );
    await screen.findByTestId('fit-warnings');

    await user.click(screen.getByRole('button', { name: /I want to serve/ }));
    await user.click(
      await screen.findByRole('option', { name: 'qwen3-4b-instruct' }),
    );

    const blocked = await screen.findByTestId('deploy-blocked');
    expect(blocked).toHaveTextContent(
      'Deploy is blocked: qwen3-4b-instruct fits no size of this pool',
    );
    expect(blocked).toHaveTextContent(TOO_SMALL);
    expect(
      screen.getByRole('button', { name: /^Deploy \(blocked/ }),
    ).toBeDisabled();
    // The chosen preset's warning is the blocker, not repeated among the others.
    expect(screen.queryByTestId('fit-warnings')).not.toBeInTheDocument();
    expect(
      within(picker).getByRole('checkbox', {
        name: /g6\.2xlarge.*hosts qwen3-4b-instruct/,
      }),
    ).toBeInTheDocument();
    expect(
      within(picker).getByRole('checkbox', {
        name: /g6\.xlarge.*does not host qwen3-4b-instruct/,
      }),
    ).toBeInTheDocument();

    await user.click(
      within(blocked).getByRole('button', { name: 'Add 2xlarge' }),
    );
    await waitFor(() =>
      expect(screen.queryByTestId('deploy-blocked')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeEnabled();

    // A preset the accelerator cannot serve at all: the GPU-memory reason, no size to add.
    await user.click(screen.getByRole('button', { name: /I want to serve/ }));
    await user.click(
      await screen.findByRole('option', { name: 'qwen3-coder-next' }),
    );
    const gpu = await screen.findByTestId('deploy-blocked');
    expect(gpu).toHaveTextContent(GPU_MEMORY);
    expect(
      within(gpu).queryByRole('button', { name: /^Add/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Deploy \(blocked/ }),
    ).toBeDisabled();
  });

  it('a cluster without presets shows the note instead of an empty table', async () => {
    const user = userEvent.setup();
    await renderDialog({ noPresets: true });
    await fillAndReview(user);
    expect(screen.getByTestId('preset-fit-note')).toHaveTextContent(
      'no serving preset is published on wc1 yet',
    );
    expect(screen.queryByTestId('preset-fit')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /I want to serve/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deploy' })).toBeEnabled();
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
    expect(onDeployed).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('partial-write')).not.toBeInTheDocument();
  });
});
