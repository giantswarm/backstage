import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import {
  useNodePoolWrite,
  type GpuNodePoolRow,
} from '../../hooks/useClusterManager';
import type { ServedModel } from '../../lib/serving';
import {
  RemoveGpuNodePoolDialog,
  servedModelsOnCluster,
} from './RemoveGpuNodePoolDialog';

const ROW: GpuNodePoolRow = {
  id: 'inst-1/wc1/wc1-gpu-l4',
  installation: 'inst-1',
  cluster: {
    name: 'wc1',
    namespace: 'org-acme',
    organization: 'acme',
    releaseVersion: '30.1.0',
    ownCluster: false,
    gpuOperator: { status: 'present', provider: 'cluster-manager' },
    serving: { status: 'present', provider: 'cluster-manager' },
    poolReleases: [
      {
        name: 'wc1-gpu-l4',
        namespace: 'org-acme',
        chartVersion: '0.3.0',
        ready: true,
      },
    ],
    commitTarget: null,
  },
  poolName: 'gpu-l4',
  pool: {
    name: 'wc1-gpu-l4',
    namespace: 'org-acme',
    version: 'v1.31.4',
    controlPlaneVersion: 'v1.31.4',
    replicas: 1,
    readyReplicas: 1,
    instanceTypes: ['g6.xlarge'],
    accelerator: 'nvidia-l4',
    ownerRelease: { name: 'wc1-gpu-l4', namespace: 'org-acme' },
  },
};

function servedModel(overrides: Partial<ServedModel>): ServedModel {
  return {
    id: overrides.name ?? 'm',
    installation: 'inst-1',
    backend: 'kserve',
    name: 'llama',
    readiness: 'ready',
    endpointHosts: ['models.wc1.acme.example.io'],
    ...overrides,
  } as ServedModel;
}

const GUARD =
  "node pool gpu-l4 still runs 1 node(s) (i-0abc123): something is scheduled on them — check the cluster's Serving group, scale the workloads away and re-run once the pool is empty, or pass force to delete the pool with its nodes";

function Harness() {
  const write = useNodePoolWrite('inst-1');
  return (
    <RemoveGpuNodePoolDialog
      row={ROW}
      isOpen
      onOpenChange={() => {}}
      write={write}
      servedModels={[
        servedModel({ name: 'llama-3', namespace: 'models' }),
        servedModel({
          name: 'elsewhere',
          endpointHosts: ['models.wc2.acme.example.io'],
        }),
        servedModel({ name: 'ollama-one', backend: 'ollama' }),
      ]}
      canCommit={false}
    />
  );
}

async function renderDialog(refusals: string[]) {
  const answers = [...refusals];
  const callTool = jest.fn(
    async (name: string, _args: Record<string, unknown>) => {
      if (name !== 'x_cluster-manager_delete_node_pool') {
        throw new Error(`unexpected tool ${name}`);
      }
      const refusal = answers.shift();
      if (refusal) {
        throw new Error(refusal);
      }
      return {
        cluster: 'wc1',
        namespace: 'org-acme',
        pool: 'gpu-l4',
        mode: 'apply',
        dryRun: false,
        objects: [],
      };
    },
  );
  const api = { callTool } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <Harness />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

describe('servedModelsOnCluster', () => {
  it('keeps the kserve models of the installation whose hosts name the cluster', () => {
    const models = [
      servedModel({ name: 'on-wc1' }),
      servedModel({
        name: 'on-wc2',
        endpointHosts: ['models.wc2.acme.example.io'],
      }),
      servedModel({ name: 'other-installation', installation: 'inst-2' }),
      servedModel({ name: 'ollama', backend: 'ollama' }),
      servedModel({ name: 'unplaced', endpointHosts: [] }),
    ];
    expect(
      servedModelsOnCluster(models, 'inst-1', 'wc1').map(m => m.name),
    ).toEqual(['on-wc1', 'unplaced']);
  });
});

describe('RemoveGpuNodePoolDialog', () => {
  it('names the served models and gates the confirm on typing the pool name', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog([]);
    const served = screen.getByTestId('served-models');
    expect(served).toHaveTextContent('Models served on this cluster (1):');
    expect(served).toHaveTextContent('llama-3 (models)');
    expect(served).not.toHaveTextContent('elsewhere');

    const confirm = screen.getByRole('button', { name: 'Remove pool' });
    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByLabelText(/Type wc1-gpu-l4 to confirm/),
      'wc1-gpu-l4',
    );
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_cluster-manager_delete_node_pool',
        {
          cluster: 'wc1',
          namespace: 'org-acme',
          name: 'gpu-l4',
          mode: 'apply',
        },
        'inst-1',
      ),
    );
  });

  it('shows the replicas guard with the nodes it names and offers force', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog([GUARD]);
    await user.type(
      screen.getByLabelText(/Type wc1-gpu-l4 to confirm/),
      'wc1-gpu-l4',
    );
    await user.click(screen.getByRole('button', { name: 'Remove pool' }));

    expect(
      await screen.findByText('The pool still runs 1 node'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('guard-nodes')).toHaveTextContent('i-0abc123');
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('force');

    await user.click(screen.getByRole('checkbox', { name: /Remove anyway/ }));
    await user.click(
      screen.getByRole('button', { name: 'Remove pool and its nodes' }),
    );
    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(2));
    expect(callTool.mock.calls[1][1]).toMatchObject({
      force: true,
      mode: 'apply',
    });
  });

  it('shows any other refusal verbatim', async () => {
    const user = userEvent.setup();
    const refusal =
      'HelmRelease org-acme/wc1-gpu-l4 was not created by cluster-manager (Kustomization flux-system/clusters): delete_node_pool removes only what create_node_pool created';
    await renderDialog([refusal]);
    await user.type(
      screen.getByLabelText(/Type wc1-gpu-l4 to confirm/),
      'wc1-gpu-l4',
    );
    await user.click(screen.getByRole('button', { name: 'Remove pool' }));
    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(screen.queryByTestId('guard-nodes')).not.toBeInTheDocument();
  });
});
