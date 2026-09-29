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
  type ModelCacheRow,
} from '../../hooks/useClusterManager';
import type { CacheClaim, ManagedCluster } from '../../lib/clusterManager';
import type { ServedModel } from '../../lib/serving';
import {
  ACKNOWLEDGE_LOSS,
  RemoveModelCacheDialog,
} from './RemoveModelCacheDialog';

const CLUSTER: ManagedCluster = {
  name: 'wc1',
  namespace: 'org-acme',
  organization: 'acme',
  releaseVersion: '31.0.0',
  ownCluster: false,
  gpuOperator: { status: 'present', provider: 'cluster-manager' },
  serving: { status: 'present', provider: 'cluster-manager' },
  poolReleases: [],
  commitTarget: null,
};

const CLAIM: CacheClaim = {
  namespace: 'model-serving',
  name: 'hf-cache',
  phase: 'Bound',
  volume: 'pvc-1',
  zone: 'eu-central-1b',
  capacity: '100Gi',
  capacityGiB: 100,
  tier: { type: 'gp3', iops: 3000, throughputMiBps: 500 },
  reclaimPolicy: 'Delete',
  created: '2026-09-18T20:31:04Z',
  price: {
    monthlyUSD: 27.37,
    source: 'AWS EBS gp3 list price, EU (Frankfurt) (eu-central-1)',
    asOf: '2026-09-19',
  },
  mounted: true,
};

const ROW: ModelCacheRow = {
  id: 'inst-1/wc1/hf-cache',
  installation: 'inst-1',
  cluster: CLUSTER,
  claim: CLAIM,
};

const REFUSAL =
  'the model cache of wc1 is in use — model-serving/hf-cache is mounted by pod model-serving/qwen3-8b-kserve-1 (LLMInferenceService model-serving/qwen3-8b (Qwen/Qwen3-8B-FP8))';
const REFUSED = {
  nodes: [],
  models: ['LLMInferenceService model-serving/qwen3-8b (Qwen/Qwen3-8B-FP8)'],
  hint: "Unload the served model(s) with model-manager's unload_model and re-run: a claim a pod mounts is not deleted until the pod is gone.",
  readFrom: 'cluster',
};

const structuredRefusal = () =>
  Object.assign(new Error(REFUSAL), {
    details: [JSON.stringify({ refused: REFUSED })],
  });

const REMOVED = {
  cluster: 'wc1',
  namespace: 'org-acme',
  mode: 'apply',
  dryRun: false,
  objects: [
    {
      apiVersion: 'helm.toolkit.fluxcd.io/v2',
      kind: 'HelmRelease',
      name: 'wc1-agent-platform',
      namespace: 'org-acme',
      action: 'updated',
      changes: ['spec.values.modelServing.cache.enabled'],
    },
    {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      name: 'hf-cache',
      namespace: 'model-serving',
      action: 'deleted',
    },
  ],
  removedClaims: [CLAIM],
  cache: { enabled: false, note: 'the model cache of wc1 is removed' },
};

function Harness({
  onOpenChange,
  onRemoved,
}: {
  onOpenChange: (isOpen: boolean) => void;
  onRemoved: (row: ModelCacheRow, result: unknown) => void;
}) {
  const write = useNodePoolWrite('inst-1');
  return (
    <RemoveModelCacheDialog
      row={ROW}
      isOpen
      onOpenChange={onOpenChange}
      write={write}
      servedModels={[
        {
          id: 'qwen3-8b',
          installation: 'inst-1',
          backend: 'kserve',
          name: 'qwen3-8b',
          readiness: 'ready',
          endpointHosts: ['models.wc1.acme.example.io'],
        } as ServedModel,
      ]}
      onRemoved={onRemoved}
    />
  );
}

async function renderDialog(answers: (Error | 'complete')[]) {
  const queue = [...answers];
  const callTool = jest.fn(
    async (name: string, _args: Record<string, unknown>) => {
      if (name !== 'x_cluster-manager_remove_model_cache') {
        throw new Error(`unexpected tool ${name}`);
      }
      const answer = queue.shift() ?? 'complete';
      if (answer instanceof Error) {
        throw answer;
      }
      return REMOVED;
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

describe('RemoveModelCacheDialog', () => {
  it('names what goes, what stops and what follows, and removes the one claim as the person once the loss is acknowledged', async () => {
    const user = userEvent.setup();
    const { callTool, onOpenChange, onRemoved } = await renderDialog([]);
    expect(screen.getByTestId('remove-cache-what')).toHaveTextContent(
      'Deletes claim model-serving/hf-cache (100 GiB gp3 at 500 MiB/s, eu-central-1b) on wc1 of inst-1, with its volume. The $27.37/month at list prices stops.',
    );
    expect(
      screen.getByText(
        /The cluster's serving slice mounts this claim: it switches to serve from the node's disk — every pool of the cluster/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('served-models')).toHaveTextContent(
      'Models served on this cluster (1):qwen3-8b',
    );
    const confirm = screen.getByRole('button', { name: 'Remove cache' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByLabelText(ACKNOWLEDGE_LOSS));
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(callTool).toHaveBeenCalledWith(
      'x_cluster-manager_remove_model_cache',
      {
        cluster: 'wc1',
        namespace: 'org-acme',
        claim: 'hf-cache',
        mode: 'apply',
      },
      'inst-1',
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the structured refusal with the models to unload and Check again, then removes', async () => {
    const user = userEvent.setup();
    const { callTool, onRemoved } = await renderDialog([structuredRefusal()]);
    await user.click(screen.getByLabelText(ACKNOWLEDGE_LOSS));
    await user.click(screen.getByRole('button', { name: 'Remove cache' }));
    const refused = await screen.findByTestId('remove-cache-refused');
    expect(refused).toHaveTextContent(
      'cluster-manager refused: the cache is in use',
    );
    expect(screen.getByTestId('refused-models')).toHaveTextContent(
      'Unload this model first, on the Serving page:LLMInferenceService model-serving/qwen3-8b (Qwen/Qwen3-8B-FP8)',
    );
    expect(refused).toHaveTextContent(REFUSED.hint);
    expect(onRemoved).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalled());
    expect(callTool).toHaveBeenCalledTimes(2);
  });
});
