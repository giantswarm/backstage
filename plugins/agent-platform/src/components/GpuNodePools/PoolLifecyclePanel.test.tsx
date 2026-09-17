import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { GpuNodePoolRow } from '../../hooks/useClusterManager';
import type { ManagedCluster, NodePool } from '../../lib/clusterManager';
import { newServeIntent, type ServeIntent } from '../../lib/serveIntent';
import type { ServedModel } from '../../lib/serving';
import { modelsRouteRef } from '../../routes';
import {
  PoolLifecyclePanel,
  serveFirstModelHref,
  TRY_SERVING_AGAIN,
  type OpenedPool,
  type PoolServeState,
} from './PoolLifecyclePanel';

const T0 = '2026-09-17T12:00:00Z';
const T1 = '2026-09-17T12:05:00Z';

const OPENED: OpenedPool = {
  id: 'inst-1/wc1/wc1-gpu-l4',
  installation: 'inst-1',
  cluster: 'wc1',
  poolName: 'gpu-l4',
};

const READY_CLUSTER: ManagedCluster = {
  name: 'wc1',
  namespace: 'org-acme',
  organization: 'acme',
  releaseVersion: '31.0.0',
  ownCluster: false,
  gpuOperator: { status: 'present', provider: 'cluster-manager' },
  serving: { status: 'present', provider: 'cluster-manager' },
  poolReleases: [
    {
      name: 'wc1-gpu-l4',
      namespace: 'org-acme',
      chartVersion: '0.3.1',
      ready: true,
    },
  ],
  commitTarget: null,
};

const READY_POOL: NodePool = {
  name: 'wc1-gpu-l4',
  namespace: 'org-acme',
  version: 'v1.31.4',
  controlPlaneVersion: 'v1.31.4',
  replicas: 0,
  readyReplicas: 0,
  instanceTypes: ['g6.2xlarge'],
  accelerator: 'nvidia-l4',
  ownerRelease: { name: 'wc1-gpu-l4', namespace: 'org-acme' },
};

const READY_ROW: GpuNodePoolRow = {
  id: OPENED.id,
  installation: 'inst-1',
  cluster: READY_CLUSTER,
  poolName: 'gpu-l4',
  pool: READY_POOL,
};

const CREATING_ROW: GpuNodePoolRow = {
  ...READY_ROW,
  cluster: {
    ...READY_CLUSTER,
    serving: { status: 'absent' },
    poolReleases: [{ ...READY_CLUSTER.poolReleases[0], ready: false }],
  },
};

const INTENT: ServeIntent = newServeIntent(
  OPENED,
  { preset: 'qwen3-8b-fp8', displayName: 'Qwen3 8B FP8' },
  T0,
);

const ON_ITS_WAY: ServedModel = {
  id: 'inst-1/kserve/model-serving/qwen3-8b-fp8',
  installation: 'inst-1',
  backend: 'kserve',
  name: 'qwen3-8b-fp8',
  preset: 'qwen3-8b-fp8',
  readiness: 'pending',
  endpointHosts: [],
  loaded: true,
  phase: 'downloadingWeights',
  steps: [
    { name: 'scheduling', state: 'done', since: T0, finishedAt: T1 },
    { name: 'nodeStarting', state: 'done', since: T1, finishedAt: T1 },
    {
      name: 'downloadingWeights',
      state: 'inProgress',
      since: T1,
      bytesCompleted: 3_000_000_000,
      bytesTotal: 9_000_000_000,
    },
    { name: 'pullingImage', state: 'pending' },
    { name: 'ready', state: 'pending' },
  ],
};

function serveState(overrides: Partial<PoolServeState> = {}): PoolServeState {
  return {
    intent: INTENT,
    model: undefined,
    loading: false,
    onRetry: jest.fn(),
    ...overrides,
  };
}

async function renderPanel(row: GpuNodePoolRow, serve?: PoolServeState) {
  await renderInTestApp(
    <PoolLifecyclePanel
      opened={OPENED}
      row={row}
      serve={serve}
      onClose={() => {}}
    />,
    { mountedRoutes: { '/agent-platform/models': modelsRouteRef } },
  );
  return within(screen.getByTestId('pool-lifecycle'));
}

const stepOf = (panel: ReturnType<typeof within>, id: string) =>
  panel
    .getAllByTestId('lifecycle-step')
    .find((element: HTMLElement) => element.getAttribute('data-step') === id)!;

describe('serveFirstModelHref', () => {
  it('names installation, cluster and pool, and the preset where the pool carries an intent', () => {
    expect(serveFirstModelHref('/serving', OPENED)).toBe(
      '/serving?serve=1&installation=inst-1&cluster=wc1&pool=gpu-l4',
    );
    expect(serveFirstModelHref('/serving', OPENED, 'qwen3-8b-fp8')).toBe(
      '/serving?serve=1&installation=inst-1&cluster=wc1&pool=gpu-l4&preset=qwen3-8b-fp8',
    );
  });
});

describe('PoolLifecyclePanel with a serve intent', () => {
  it('ends in Serving <preset>, pending until the pool’s steps are done', async () => {
    const panel = await renderPanel(CREATING_ROW, serveState());
    const serve = stepOf(panel, 'serve');
    expect(serve).toHaveAttribute('data-state', 'pending');
    expect(serve).toHaveTextContent('Serving Qwen3 8B FP8');
    expect(serve).toHaveTextContent('once the steps above are done');
    expect(panel.queryByText('Serve your first model')).not.toBeInTheDocument();
    expect(panel.getByText(/serving Qwen3 8B FP8/)).toBeInTheDocument();
  });

  it('shows the served model’s own steps beneath it while it is on its way', async () => {
    const panel = await renderPanel(
      READY_ROW,
      serveState({
        intent: {
          ...INTENT,
          outcome: { kind: 'served', resource: 'qwen3-8b-fp8', at: T1 },
        },
        model: ON_ITS_WAY,
      }),
    );
    const serve = stepOf(panel, 'serve');
    expect(serve).toHaveAttribute('data-state', 'inProgress');
    expect(serve).toHaveTextContent('qwen3-8b-fp8 · weights in the cache');
    const nested = within(serve);
    expect(
      nested.getByRole('list', { name: 'Steps of Serving Qwen3 8B FP8' }),
    ).toBeInTheDocument();
    expect(stepOf(nested, 'downloadingWeights')).toHaveAttribute(
      'data-state',
      'inProgress',
    );
    expect(stepOf(nested, 'downloadingWeights')).toHaveTextContent(
      '2.8 GiB of 8.4 GiB',
    );
    expect(stepOf(nested, 'ready')).toHaveAttribute('data-state', 'pending');
  });

  it('a refused fit reads as the dialog words it, with Serve another model as the way out', async () => {
    const panel = await renderPanel(
      READY_ROW,
      serveState({
        intent: {
          ...INTENT,
          outcome: {
            kind: 'refused',
            reason: 'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB',
            details: ['needs 21.1 GB'],
            at: T1,
          },
        },
      }),
    );
    const serve = stepOf(panel, 'serve');
    expect(serve).toHaveAttribute('data-state', 'failed');
    expect(serve).toHaveTextContent(
      'Cannot be served on this pool: no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB · needs 21.1 GB',
    );
    const link = within(serve).getByRole('link', {
      name: 'Serve another model',
    });
    expect(link.getAttribute('href')).toContain('serve=1');
    expect(link.getAttribute('href')).toContain('pool=gpu-l4');
    expect(link.getAttribute('href')).not.toContain('preset=');
    expect(
      panel.queryByRole('button', { name: TRY_SERVING_AGAIN }),
    ).not.toBeInTheDocument();
  });

  it('a failed load offers Try serving again', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    const panel = await renderPanel(
      READY_ROW,
      serveState({
        intent: {
          ...INTENT,
          outcome: { kind: 'failed', message: 'backend_error: down', at: T1 },
        },
        onRetry,
      }),
    );
    const serve = stepOf(panel, 'serve');
    expect(serve).toHaveTextContent(
      'model-manager refused: backend_error: down',
    );
    // The dialog on the pool, the preset preselected: the person never picks it twice.
    expect(
      within(serve)
        .getByRole('link', { name: 'Serve Qwen3 8B FP8 in the dialog' })
        .getAttribute('href'),
    ).toContain('pool=gpu-l4&preset=qwen3-8b-fp8');
    await user.click(panel.getByRole('button', { name: TRY_SERVING_AGAIN }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('without an intent the last step is Serve your first model, as before', async () => {
    const panel = await renderPanel(READY_ROW);
    const serve = stepOf(panel, 'serve');
    expect(serve).toHaveAttribute('data-state', 'done');
    expect(
      within(serve).getByRole('link', { name: 'Serve your first model' }),
    ).toBeInTheDocument();
  });
});
