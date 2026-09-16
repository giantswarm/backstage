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

type Scenario = { commit?: boolean; createError?: Error };

function makeMusterApi(scenario: Scenario = {}) {
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
          return { clusters: [WC1] };
        case 'x_cluster-manager_create_node_pool':
          if (scenario.createError) {
            throw scenario.createError;
          }
          return args.dryRun
            ? DRY_RUN
            : {
                ...DRY_RUN,
                dryRun: false,
                mode: args.mode,
                objects: DRY_RUN.objects.map(o => ({
                  ...o,
                  action: 'created',
                })),
              };
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  const describeTool = jest.fn(async () => ({ inputSchema: {} }));
  return { api: { callTool, describeTool } as unknown as MusterApi, callTool };
}

async function renderDialog(scenario: Scenario = {}) {
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
