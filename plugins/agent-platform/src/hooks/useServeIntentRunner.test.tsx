import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type { ManagedCluster, NodePool } from '../lib/clusterManager';
import {
  modelManagerBackendsQueryKey,
  modelManagerModelsQueryKey,
} from '../lib/queryKeys';
import { newServeIntent, type ServeIntents } from '../lib/serveIntent';
import type { ServedModel } from '../lib/serving';
import type { GpuNodePoolRow } from './useClusterManager';
import { isPoolStackReady, useServeIntentRunner } from './useServeIntentRunner';
import type { ServeIntentsStore } from './useServeIntents';

const T0 = '2026-09-17T12:00:00Z';
const POOL = { installation: 'inst-1', cluster: 'wc1', poolName: 'gpu-l4' };
const ID = 'inst-1/wc1/wc1-gpu-l4';
const CHOICE = { preset: 'qwen3-8b-fp8', displayName: 'Qwen3 8B FP8' };

/** cluster-manager 0.8.1's answers once everything is Ready. */
const READY_CLUSTER: ManagedCluster = {
  name: 'wc1',
  namespace: 'org-acme',
  organization: 'acme',
  releaseVersion: '31.0.0',
  ownCluster: false,
  gpuOperator: {
    status: 'present',
    provider: 'cluster-manager',
    readiness: {
      release: { name: 'wc1-gpu-operator', ready: true, since: T0 },
      clusterPolicy: { name: 'cluster-policy', state: 'ready' },
      operands: [],
    },
  },
  serving: {
    status: 'present',
    provider: 'cluster-manager',
    readiness: {
      release: { name: 'wc1-agent-platform', ready: true, since: T0 },
      children: [{ name: 'kserve-crd', ready: true, since: T0 }],
      controllers: [
        { name: 'kserve-controller-manager', available: 1, replicas: 1 },
      ],
      configs: { count: 10 },
      backend: {
        registered: true,
        namespace: 'agent-platform',
        name: 'model-backend-kserve',
      },
      presets: { count: 9 },
      modelsGateway: { name: 'models', ready: true, reason: 'Programmed' },
    },
  },
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
  phase: 'ready',
  steps: [
    { name: 'release', state: 'done', since: T0, finishedAt: T0 },
    { name: 'machinePool', state: 'done', since: T0, finishedAt: T0 },
    { name: 'nodes', state: 'done', since: T0, finishedAt: T0 },
  ],
};

function row(overrides: Partial<GpuNodePoolRow> = {}): GpuNodePoolRow {
  return {
    id: ID,
    installation: 'inst-1',
    cluster: READY_CLUSTER,
    poolName: 'gpu-l4',
    pool: READY_POOL,
    ...overrides,
  };
}

const CREATING_ROW = row({
  pool: {
    ...READY_POOL,
    phase: 'creating',
    steps: [{ name: 'release', state: 'inProgress', since: T0 }],
  },
});

const FIT_OK = {
  model: 'qwen3-8b-fp8',
  backend: 'kserve',
  fits: true,
  instanceType: 'g6.2xlarge',
  cached: true,
  cacheSource: 'index',
};
const FIT_NO = {
  model: 'qwen3-8b-fp8',
  backend: 'kserve',
  fits: false,
  reason: 'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB',
  requiredBytes: 21_100_000_000,
};
const LOADED = {
  name: 'qwen3-8b-fp8',
  backend: 'kserve',
  loaded: false,
  running: {
    resource: 'qwen3-8b-fp8',
    kind: 'LLMInferenceService',
    phase: 'scheduling',
  },
  fit: FIT_OK,
};

function servedModel(overrides: Partial<ServedModel> = {}): ServedModel {
  return {
    id: 'inst-1/kserve/model-serving/qwen3-8b-fp8',
    installation: 'inst-1',
    backend: 'kserve',
    name: 'qwen3-8b-fp8',
    preset: 'qwen3-8b-fp8',
    readiness: 'pending',
    endpointHosts: [],
    loaded: true,
    phase: 'scheduling',
    steps: [{ name: 'scheduling', state: 'inProgress', since: T0 }],
    ...overrides,
  };
}

/** A store over a plain object, recording every write. */
function makeStore(initial: ServeIntents) {
  let intents = initial;
  const writes: unknown[] = [];
  const store: ServeIntentsStore = {
    intents,
    intentOf: id => intents[id],
    record: jest.fn(),
    setOutcome: jest.fn((id, outcome) => {
      writes.push({ id, outcome });
      intents = { ...intents, [id]: { ...intents[id], outcome } };
      store.intents = intents;
    }),
    clearOutcome: jest.fn(),
    remove: jest.fn(ids => {
      writes.push({ removed: ids });
    }),
  };
  return { store, writes };
}

function Harness({
  store,
  rows,
  servedModels,
  settledInstallations = ['inst-1'],
}: {
  store: ServeIntentsStore;
  rows: GpuNodePoolRow[];
  servedModels: ServedModel[];
  settledInstallations?: string[];
}) {
  const runner = useServeIntentRunner({
    store,
    rows,
    servedModels,
    settledInstallations,
  });
  return <div data-testid="serving">{String(runner.isServing(ID))}</div>;
}

async function render(
  store: ServeIntentsStore,
  rows: GpuNodePoolRow[],
  servedModels: ServedModel[],
  answers: Record<string, unknown | Error>,
) {
  const callTool = jest.fn(
    async (
      name: string,
      _args: Record<string, unknown>,
      _installation?: string,
    ) => {
      const answer = answers[name.replace(/^x_model-manager_/, '')];
      if (answer instanceof Error) {
        throw answer;
      }
      if (answer === undefined) {
        throw new Error(`unexpected tool ${name}`);
      }
      return answer;
    },
  );
  const api = { callTool } as unknown as MusterApi;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Spied before the render: the runner invalidates from the effect, before
  // the render settles.
  const invalidateQueries = jest.spyOn(queryClient, 'invalidateQueries');
  const utils = await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <Harness store={store} rows={rows} servedModels={servedModels} />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool, invalidateQueries, ...utils };
}

const toolNames = (callTool: jest.Mock) =>
  callTool.mock.calls.map(call => call[0]);

/** The query keys `invalidateQueries` was asked for. */
const invalidatedKeys = (invalidateQueries: jest.SpyInstance) =>
  invalidateQueries.mock.calls.map(call => call[0]?.queryKey);

describe('isPoolStackReady', () => {
  it('is the same gate as Serve your first model: every lifecycle step done', () => {
    expect(isPoolStackReady(row())).toBe(true);
    expect(isPoolStackReady(CREATING_ROW)).toBe(false);
  });
});

describe('useServeIntentRunner', () => {
  it('waits for the pool’s stack, then asks check_fit and load_model once as the person and keeps the object composed', async () => {
    const { store, writes } = makeStore({
      [ID]: newServeIntent(POOL, CHOICE, T0),
    });
    const { callTool, rerender } = await render(store, [CREATING_ROW], [], {
      check_fit: FIT_OK,
      load_model: LOADED,
    });
    expect(callTool).not.toHaveBeenCalled();

    const ready = row();
    rerender(
      <TestApiProvider
        apis={[[musterApiRef, { callTool } as unknown as MusterApi]]}
      >
        <QueryClientProvider client={new QueryClient()}>
          <Harness store={store} rows={[ready]} servedModels={[]} />
        </QueryClientProvider>
      </TestApiProvider>,
    );
    await waitFor(() =>
      expect(store.setOutcome).toHaveBeenCalledWith(
        ID,
        expect.objectContaining({ kind: 'served', resource: 'qwen3-8b-fp8' }),
      ),
    );
    expect(toolNames(callTool)).toEqual([
      'x_model-manager_check_fit',
      'x_model-manager_load_model',
    ]);
    expect(callTool.mock.calls[0][1]).toEqual({
      model: 'qwen3-8b-fp8',
      backend: 'kserve',
    });
    expect(callTool.mock.calls[1][1]).toEqual({
      model: 'qwen3-8b-fp8',
      backend: 'kserve',
    });
    expect(callTool.mock.calls[0][2]).toBe('inst-1');
    await waitFor(() =>
      expect(screen.getByTestId('serving')).toHaveTextContent('false'),
    );

    // A later render with the outcome persisted asks nothing again.
    rerender(
      <TestApiProvider
        apis={[[musterApiRef, { callTool } as unknown as MusterApi]]}
      >
        <QueryClientProvider client={new QueryClient()}>
          <Harness store={{ ...store }} rows={[ready]} servedModels={[]} />
        </QueryClientProvider>
      </TestApiProvider>,
    );
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(callTool).toHaveBeenCalledTimes(2);
    expect(writes).toHaveLength(1);
  });

  it('re-reads the installation’s backends and inventory once load_model was accepted, so the served model’s steps follow with that read', async () => {
    const { store } = makeStore({ [ID]: newServeIntent(POOL, CHOICE, T0) });
    const { invalidateQueries } = await render(store, [row()], [], {
      check_fit: FIT_OK,
      load_model: LOADED,
    });
    await waitFor(() =>
      expect(store.setOutcome).toHaveBeenCalledWith(
        ID,
        expect.objectContaining({ kind: 'served' }),
      ),
    );
    // The backends list gates the inventory read: a pool that registered its
    // backend after the list was read leaves the inventory unread until the
    // list is read again — so both go, for this installation.
    await waitFor(() =>
      expect(invalidatedKeys(invalidateQueries)).toEqual(
        expect.arrayContaining([
          modelManagerBackendsQueryKey('inst-1'),
          modelManagerModelsQueryKey('inst-1'),
        ]),
      ),
    );
  });

  it('keeps check_fit’s refusal with its reason and never calls load_model, nor re-reads anything', async () => {
    const { store } = makeStore({ [ID]: newServeIntent(POOL, CHOICE, T0) });
    const { callTool, invalidateQueries } = await render(store, [row()], [], {
      check_fit: FIT_NO,
      load_model: LOADED,
    });
    await waitFor(() =>
      expect(store.setOutcome).toHaveBeenCalledWith(ID, {
        kind: 'refused',
        reason: 'no size of the pool hosts qwen3-8b-fp8: needs 21.1 GB',
        details: ['needs 19.7 GiB'],
        at: expect.any(String),
      }),
    );
    expect(toolNames(callTool)).toEqual(['x_model-manager_check_fit']);
    await waitFor(() =>
      expect(screen.getByTestId('serving')).toHaveTextContent('false'),
    );
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it('keeps what load_model threw, and re-reads the inventory all the same — a load that timed out may well have completed', async () => {
    const { store } = makeStore({ [ID]: newServeIntent(POOL, CHOICE, T0) });
    const { invalidateQueries } = await render(store, [row()], [], {
      check_fit: FIT_OK,
      load_model: new Error('backend_error: kserve backend unreachable'),
    });
    await waitFor(() =>
      expect(store.setOutcome).toHaveBeenCalledWith(ID, {
        kind: 'failed',
        message: 'backend_error: kserve backend unreachable',
        at: expect.any(String),
      }),
    );
    await waitFor(() =>
      expect(invalidatedKeys(invalidateQueries)).toEqual(
        expect.arrayContaining([modelManagerModelsQueryKey('inst-1')]),
      ),
    );
  });

  it('a served model of the preset on the cluster is the outcome — nothing is loaded', async () => {
    const { store } = makeStore({ [ID]: newServeIntent(POOL, CHOICE, T0) });
    const { callTool } = await render(
      store,
      [row()],
      [servedModel({ name: 'qwen3-8b-fp8-by-hand' })],
      { check_fit: FIT_OK, load_model: LOADED },
    );
    await waitFor(() =>
      expect(store.setOutcome).toHaveBeenCalledWith(
        ID,
        expect.objectContaining({
          kind: 'served',
          resource: 'qwen3-8b-fp8-by-hand',
        }),
      ),
    );
    expect(callTool).not.toHaveBeenCalled();
  });

  it('records when the served model was first seen ready, once', async () => {
    const { store } = makeStore({
      [ID]: {
        ...newServeIntent(POOL, CHOICE, T0),
        outcome: { kind: 'served', resource: 'qwen3-8b-fp8', at: T0 },
      },
    });
    const ready = servedModel({
      readiness: 'ready',
      phase: 'ready',
      steps: [
        {
          name: 'ready',
          state: 'done',
          since: T0,
          finishedAt: '2026-09-17T12:09:45Z',
        },
      ],
    });
    const { callTool } = await render(store, [row()], [ready], {});
    await waitFor(() =>
      expect(store.setOutcome).toHaveBeenCalledWith(ID, {
        kind: 'served',
        resource: 'qwen3-8b-fp8',
        at: T0,
        ready: '2026-09-17T12:09:45Z',
      }),
    );
    expect(store.setOutcome).toHaveBeenCalledTimes(1);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('prunes an old intent whose pool a settled list no longer carries', async () => {
    const { store } = makeStore({
      [ID]: newServeIntent(POOL, CHOICE, '2026-01-01T00:00:00Z'),
    });
    await render(store, [], [], {});
    await waitFor(() => expect(store.remove).toHaveBeenCalledWith([ID]));
  });
});
