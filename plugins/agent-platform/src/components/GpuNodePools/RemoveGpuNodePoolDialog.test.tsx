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
import type { NodePoolWriteResult } from '../../lib/clusterManager';
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

const REFUSAL =
  'node pool gpu-l4 still runs 1 node(s) (i-0abc123): a model is served on the cluster — unload it and re-run once the pool is empty, or pass force to delete the pool with its nodes';
const REFUSED = {
  nodes: ['i-0abc123'],
  models: ['LLMInferenceService model-serving/qwen3-4b (Qwen/Qwen3-4B)'],
  hint: 'Karpenter removes an empty node about 10 minutes after its last pod; a served model has to be unloaded first.',
};

/** The refusal as the muster client throws it: the message, the structured block as `details`. */
const structuredRefusal = () =>
  Object.assign(new Error(REFUSAL), {
    details: [JSON.stringify({ refused: REFUSED })],
  });

type Answer = Error | 'partial' | 'complete';

const OBJECTS = [
  {
    apiVersion: 'helm.toolkit.fluxcd.io/v2',
    kind: 'HelmRelease',
    name: 'wc1-gpu-l4',
    namespace: 'org-acme',
  },
  {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    name: 'model-backend-kserve',
    namespace: 'agent-platform',
  },
];

function Harness({
  onOpenChange,
  onRemoved,
}: {
  onOpenChange: (isOpen: boolean) => void;
  onRemoved: (result: NodePoolWriteResult) => void;
}) {
  const write = useNodePoolWrite('inst-1');
  return (
    <RemoveGpuNodePoolDialog
      row={ROW}
      isOpen
      onOpenChange={onOpenChange}
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
      onRemoved={onRemoved}
    />
  );
}

/** `delete_node_pool` answers in order: a thrown refusal, a `partial` answer, or the complete delete (the default once the list is used up). */
async function renderDialog(answers: Answer[]) {
  const queue = [...answers];
  const callTool = jest.fn(
    async (name: string, _args: Record<string, unknown>) => {
      if (name !== 'x_cluster-manager_delete_node_pool') {
        throw new Error(`unexpected tool ${name}`);
      }
      const answer = queue.shift() ?? 'complete';
      if (answer instanceof Error) {
        throw answer;
      }
      const partial = answer === 'partial';
      return {
        cluster: 'wc1',
        namespace: 'org-acme',
        pool: 'gpu-l4',
        mode: 'apply',
        dryRun: false,
        lastPool: true,
        objects: OBJECTS.map((object, index) => ({
          ...object,
          action:
            partial && index === OBJECTS.length - 1 ? 'pending' : 'deleted',
        })),
        ...(partial
          ? {
              partial: true,
              nextStep:
                're-run with the same arguments, the pending objects are written first',
            }
          : {}),
      };
    },
  );
  const api = { callTool } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChange = jest.fn();
  const onRemoved = jest.fn();
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <Harness onOpenChange={onOpenChange} onRemoved={onRemoved} />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool, onOpenChange, onRemoved };
}

async function confirmRemove(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(/Type wc1-gpu-l4 to confirm/),
    'wc1-gpu-l4',
  );
  await user.click(screen.getByRole('button', { name: 'Remove pool' }));
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

  it('shows the structured refusal — nodes, models, hint — and Check again re-runs without force', async () => {
    const user = userEvent.setup();
    const { callTool, onOpenChange, onRemoved } = await renderDialog([
      structuredRefusal(),
    ]);
    await confirmRemove(user);

    const refused = await screen.findByTestId('remove-refused');
    expect(refused).toHaveTextContent(
      'cluster-manager refused: the pool still runs 1 node',
    );
    expect(screen.getByTestId('refused-nodes')).toHaveTextContent('i-0abc123');
    expect(screen.getByTestId('refused-models')).toHaveTextContent(
      'Unload this model first',
    );
    expect(screen.getByTestId('refused-models')).toHaveTextContent('qwen3-4b');
    expect(refused).toHaveTextContent(REFUSED.hint);
    expect(callTool.mock.calls[0][1]).not.toHaveProperty('force');
    expect(
      screen.getByRole('checkbox', { name: /Remove anyway/ }),
    ).not.toBeChecked();
    expect(onOpenChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(2));
    expect(callTool.mock.calls[1][1]).not.toHaveProperty('force');
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onRemoved).toHaveBeenCalledWith(
      expect.objectContaining({ pool: 'gpu-l4', lastPool: true }),
    );
  });

  it('Remove anyway is the second choice: force goes with the confirm, after the refusal', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderDialog([structuredRefusal()]);
    await confirmRemove(user);
    await screen.findByTestId('remove-refused');

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

  it('shows a refusal without the block as it is, with Check again and no Remove anyway', async () => {
    const user = userEvent.setup();
    const refusal =
      'HelmRelease org-acme/wc1-gpu-l4 was not created by cluster-manager (Kustomization flux-system/clusters): delete_node_pool removes only what create_node_pool created';
    const { callTool } = await renderDialog([new Error(refusal)]);
    await confirmRemove(user);

    expect(await screen.findByText(refusal)).toBeInTheDocument();
    expect(screen.queryByTestId('refused-nodes')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /Remove anyway/ }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(2));
  });

  it('a Remove cut short shows the pending objects and Continue re-runs the same call', async () => {
    const user = userEvent.setup();
    const { callTool, onOpenChange, onRemoved } = await renderDialog([
      'partial',
    ]);
    await confirmRemove(user);

    const partial = await screen.findByTestId('partial-write');
    expect(partial).toHaveTextContent(
      'Remove was cut short: 1 of 2 objects are pending',
    );
    expect(screen.getByTestId('pending-objects')).toHaveTextContent(
      'ConfigMap agent-platform/model-backend-kserve: pending',
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Remove pool' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(callTool).toHaveBeenCalledTimes(2));
    expect(callTool.mock.calls[1][1]).toEqual(callTool.mock.calls[0][1]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onRemoved).toHaveBeenCalledTimes(1);
  });
});
