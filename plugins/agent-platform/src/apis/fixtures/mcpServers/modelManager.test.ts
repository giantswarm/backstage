import { createFixtureDataSet } from '@giantswarm/backstage-plugin-gs-common/fixtures';

import {
  MODEL_MANAGER_TOOLS,
  ModelManagerToolError,
} from '../../../lib/modelManagerBackends';
import { musterApiOf } from '../../../lib/__testUtils__/musterApiOf';
import { ModelManagerApiClient } from '../../ModelManagerApiClient';
import { ModelManagerToolsClient } from '../../ModelManagerToolsClient';
import { SETTLE_MS } from '../agentManagerFixtureState';
import { ModelHostingFixtureState, PULL_MS } from '../modelHostingFixtureState';
import { modelManagerFixtureServer } from './modelManager';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const INSTALLATION = 'meadow';

function setup(
  installation = INSTALLATION,
  settings: Parameters<typeof createFixtureDataSet>[0] = {},
) {
  const data = createFixtureDataSet({ now: NOW, ...settings });
  let now = NOW;
  const state = new ModelHostingFixtureState(data, () => now);
  const server = modelManagerFixtureServer(() => state);
  const musterApi = musterApiOf(server);
  return {
    data,
    server,
    api: new ModelManagerApiClient({
      musterApi,
      discoveryApi: {} as never,
      fetchApi: {} as never,
      kubernetesApi: {} as never,
      kubernetesAuthProvidersApi: {} as never,
    }),
    tools: new ModelManagerToolsClient(musterApi, installation),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function failureOf(
  call: Promise<unknown>,
): Promise<ModelManagerToolError> {
  const error = await call.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ModelManagerToolError);
  return error as ModelManagerToolError;
}

describe('the fixture model-manager', () => {
  it('has a handler for every tool the clients call', () => {
    const { server } = setup();
    expect(Object.keys(server.tools).sort()).toEqual(
      Object.values(MODEL_MANAGER_TOOLS).sort(),
    );
  });

  it('runs a KServe and an Ollama backend, each with what it offers', async () => {
    const { api } = setup();
    const backends = await api.listBackends(INSTALLATION);
    expect(backends.map(b => [b.backend, b.healthy])).toEqual([
      ['kserve', true],
      ['ollama', true],
    ]);
    const [kserve, ollama] = backends;
    expect(kserve.capabilities).toEqual(
      expect.objectContaining({ search: true, fitCheck: true, presets: true }),
    );
    expect(ollama.capabilities).toEqual(
      expect.objectContaining({ pull: true, search: false, fitCheck: false }),
    );
    expect(ollama.loading?.onDemand).toBe(true);
  });

  it('reports an unhealthy backend, and its failure beside the models of the others', async () => {
    const { api, data } = setup();
    const installation = 'fennel';
    const backends = await api.listBackends(installation);
    expect(backends.find(b => b.backend === 'ollama')).toEqual(
      expect.objectContaining({
        healthy: false,
        message: expect.stringContaining('connection refused'),
      }),
    );
    const models = await api.listModels(installation);
    expect(new Set(models.map(m => m.backend))).toEqual(new Set(['kserve']));
    expect(models.length).toBeGreaterThan(0);
    expect(
      data.hostedModels.some(
        m => m.installation === installation && m.backend === 'ollama',
      ),
    ).toBe(true);
  });

  it('lists models served, starting, failed and downloaded, and pulls running and failed', async () => {
    const { api } = setup();
    const models = await api.listModels(INSTALLATION, { backend: 'kserve' });
    expect(new Set(models.map(m => m.running?.status ?? 'none'))).toEqual(
      new Set(['Ready', 'Pending', 'NotReady', 'none']),
    );
    for (const model of models) {
      expect(model.preset).toBe(model.name);
    }
    const jobs = await api.listJobs(INSTALLATION);
    expect(new Set(jobs.map(j => j.phase))).toEqual(
      new Set(['running', 'failed']),
    );
    const loaded = await api.listLoaded(INSTALLATION);
    expect(loaded.length).toBeGreaterThan(0);
  });

  it("lists the GPU nodes of the KServe cluster's pools and the Ollama host", async () => {
    const { api, data } = setup();
    const nodes = await api.listNodes(INSTALLATION);
    const kserve = data.modelBackends.find(
      b => b.installation === INSTALLATION && b.kind === 'kserve',
    )!;
    const poolNodes = data.gpuPools
      .filter(
        p => p.installation === INSTALLATION && p.cluster === kserve.cluster,
      )
      .flatMap(p => p.nodes);
    expect(nodes.filter(n => n.backend === 'kserve').map(n => n.name)).toEqual(
      poolNodes,
    );
    const host = nodes.find(n => n.backend === 'ollama')!;
    expect(host.budgetSource).toBe('host-meminfo');
    for (const node of nodes) {
      expect(node.freeBytes! + node.reservedBytes!).toBeCloseTo(
        node.budgetBytes!,
        -1,
      );
    }
  });

  it('searches the hub and judges a fit', async () => {
    const { api, tools } = setup();
    const results = await api.searchModels(INSTALLATION, 'qwen3');
    expect(results.length).toBeGreaterThan(1);
    expect(results.some(r => r.presets.length > 0)).toBe(true);
    const fit = await tools.checkFit({
      model: 'qwen3-4b-instruct',
      backend: 'kserve',
    });
    expect(fit).toEqual(
      expect.objectContaining({
        preset: 'qwen3-4b-instruct',
        requiredBytes: expect.any(Number),
        reason: expect.any(String),
      }),
    );
    const tooBig = await tools.checkFit({
      model: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
      backend: 'kserve',
    });
    expect(tooBig.fits).toBe(false);
  });

  it('pulls a model in the background, joining a pull of the same model', async () => {
    const { api, advance } = setup();
    const first = await api.pullModel(INSTALLATION, {
      model: 'llama3.2:1b',
      backend: 'ollama',
    });
    expect(first.created).toBe(true);
    const again = await api.pullModel(INSTALLATION, {
      model: 'llama3.2:1b',
      backend: 'ollama',
    });
    expect(again).toEqual({
      job: expect.objectContaining({ id: first.job.id }),
      created: false,
    });
    advance(PULL_MS / 2);
    expect((await api.getJob(INSTALLATION, first.job.id)).percent).toBe(50);
    advance(PULL_MS);
    expect((await api.getJob(INSTALLATION, first.job.id)).phase).toBe(
      'succeeded',
    );
    const models = await api.listModels(INSTALLATION, { backend: 'ollama' });
    expect(models.map(m => m.name)).toContain('llama3.2:1b');
  });

  it('cancels a running pull', async () => {
    const { api } = setup();
    const { job } = await api.pullModel(INSTALLATION, {
      model: 'llama3.2:1b',
      backend: 'ollama',
    });
    expect((await api.cancelJob(INSTALLATION, job.id)).phase).toBe('cancelled');
  });

  it('serves a preset through its phases until it is ready, and says so when served already', async () => {
    const { tools, api, advance } = setup();
    const served = new Set(
      (await api.listLoaded(INSTALLATION, { backend: 'kserve' })).map(
        m => m.name,
      ),
    );
    const candidates = (await api.listPresets(INSTALLATION)).filter(
      p => !served.has(p.name),
    );
    const fits = await Promise.all(
      candidates.map(p => tools.checkFit({ model: p.name, backend: 'kserve' })),
    );
    const name = candidates[fits.findIndex(f => f.fits)]?.name;
    expect(name).toBeDefined();
    const answer = await tools.loadModel({ model: name!, backend: 'kserve' });
    expect(answer.alreadyServing).toBeUndefined();
    expect(answer.running).toEqual(
      expect.objectContaining({
        kind: 'LLMInferenceService',
        phase: 'scheduling',
      }),
    );
    expect(answer.fit?.fits).toBe(true);
    advance(6 * SETTLE_MS);
    const loaded = await api.listLoaded(INSTALLATION, { backend: 'kserve' });
    expect(loaded.find(m => m.name === name)?.status).toBe('Ready');
    const twice = await tools.loadModel({ model: name!, backend: 'kserve' });
    expect(twice.alreadyServing).toBe(true);
  });

  it('refuses a serve that fits no node', async () => {
    const { tools } = setup();
    const error = await failureOf(
      tools.loadModel({ model: 'qwen3-coder-30b-a3b', backend: 'kserve' }),
    );
    expect(error.name).toBe('PreconditionFailedError');
    expect(error.message).toMatch(/^does_not_fit: model does not fit: /);
  });

  it('refuses in model-manager words', async () => {
    const { api, tools } = setup();
    const loaded = await api.listLoaded(INSTALLATION, { backend: 'kserve' });
    const served = loaded.find(m => m.status === 'Ready')!;
    const busy = await failureOf(
      api.deleteModel(INSTALLATION, served.name, { backend: 'kserve' }),
    );
    expect(busy.name).toBe('ConflictError');
    expect(busy.message).toBe(
      `conflict: conflict: ${served.name} is served by LLMInferenceService ${served.name}; unload it first`,
    );
    const missing = await failureOf(api.unloadModel(INSTALLATION, 'nothing'));
    expect(missing.name).toBe('NotFoundError');
    expect(missing.message).toBe(
      'not_found: model not found: nothing is on none of the backends (kserve, ollama)',
    );
    const unknown = await failureOf(
      api.listModels(INSTALLATION, { backend: 'lemonade' }),
    );
    expect(unknown.message).toBe(
      'invalid_request: invalid request: unknown backend "lemonade" (configured: kserve, ollama)',
    );
    const noFit = await failureOf(
      api.fitCheck(INSTALLATION, { model: 'x', backend: 'ollama' }),
    );
    expect(noFit.message).toBe(
      'unsupported: operation not supported: fit check on ollama',
    );
    const commit = await failureOf(
      tools.addBackend(
        { kind: 'ollama', endpoint: 'http://h:11434' },
        { mode: 'commit' },
      ),
    );
    expect(commit.name).toBe('ForbiddenError');
  });

  it('unloads and deletes a model, and wires and unwires one', async () => {
    const { api } = setup();
    const models = await api.listModels(INSTALLATION, { backend: 'ollama' });
    const loaded = models.find(m => m.loaded)!;
    await api.unloadModel(INSTALLATION, loaded.name, { backend: 'ollama' });
    const after = await api.listModels(INSTALLATION, { backend: 'ollama' });
    expect(after.find(m => m.name === loaded.name)?.loaded).toBe(false);
    await api.unwireModel(INSTALLATION, loaded.name);
    expect(
      (await api.listModels(INSTALLATION)).find(m => m.name === loaded.name)
        ?.modelConfig,
    ).toBeUndefined();
    const ref = await api.wireModel(INSTALLATION, loaded.name);
    expect(ref).toEqual(
      expect.objectContaining({ namespace: 'kagent', provider: 'Ollama' }),
    );
    await api.deleteModel(INSTALLATION, loaded.name);
    expect((await api.listModels(INSTALLATION)).map(m => m.name)).not.toContain(
      loaded.name,
    );
  });

  it('adds a backend, dry and for real, and removes it with its ModelConfigs', async () => {
    const { tools, api } = setup();
    const input = {
      kind: 'lemonade' as const,
      endpoint: 'http://lemonade.example.com:8000',
    };
    const dry = await tools.addBackend(input, { dryRun: true });
    expect(dry).toEqual(
      expect.objectContaining({
        dryRun: true,
        configMap: expect.objectContaining({ name: 'model-backend-lemonade' }),
        document: expect.stringContaining(
          'endpoint: http://lemonade.example.com:8000',
        ),
      }),
    );
    expect(
      (await api.listBackends(INSTALLATION)).map(b => b.backend),
    ).not.toContain('lemonade');
    const applied = await tools.addBackend(input);
    expect(applied).toEqual(
      expect.objectContaining({ created: true, registered: true }),
    );
    expect(
      (await api.listBackends(INSTALLATION)).map(b => b.backend),
    ).toContain('lemonade');
    const missing = await failureOf(tools.addBackend({ kind: 'ollama' }));
    expect(missing.message).toBe(
      'invalid_request: invalid request: spec.endpoint: required for ollama',
    );
    const removed = await tools.removeBackend('lemonade');
    expect(removed).toEqual(expect.objectContaining({ removed: true }));
    expect(
      (await api.listBackends(INSTALLATION)).map(b => b.backend),
    ).not.toContain('lemonade');
  });

  it('answers not_found for a model gone from its backend, not a TypeError', async () => {
    const { api } = setup();
    for (const call of [
      api.wireModel(INSTALLATION, 'gone', { backend: 'kserve' }),
      api.unwireModel(INSTALLATION, 'gone', { backend: 'kserve' }),
    ]) {
      const error = await failureOf(call);
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe(
        'not_found: model not found: gone is not on kserve',
      );
    }
  });

  it('refuses a split over nodes the backend does not have, and a copy on a node short of GPUs', async () => {
    const { tools, api } = setup();
    const split = await failureOf(
      tools.checkFit({
        model: 'qwen3-4b-instruct',
        backend: 'kserve',
        placement: 'split',
        nodes: ['gone'],
      }),
    );
    expect(split.message).toBe(
      'invalid_request: invalid request: none of the nodes gone is a node of kserve',
    );
    const [node] = (
      await api.listNodes(INSTALLATION, { backend: 'kserve' })
    ).filter(n => n.gpuCount === 1);
    const short = await tools.checkFit({
      model: 'qwen3-coder-30b-a3b',
      backend: 'kserve',
      node: node.name,
    });
    expect(short.fits).toBe(false);
    expect(short.reason).toBe(`${node.name} has 1 GPU(s), the preset needs 2`);
  });

  it('serves one copy on each node named, holding its memory on each', async () => {
    const { tools, api } = setup(INSTALLATION, {
      hostedModels: { states: ['downloaded'] },
    });
    const nodes = (
      await api.listNodes(INSTALLATION, { backend: 'kserve' })
    ).map(n => n.name);
    expect(nodes.length).toBeGreaterThan(1);
    const pair = nodes.slice(0, 2);
    await tools.loadModel({
      model: 'qwen3-4b-instruct',
      backend: 'kserve',
      placement: 'copies',
      nodes: pair,
    });
    const served = (
      await api.listLoaded(INSTALLATION, { backend: 'kserve' })
    ).find(m => m.name === 'qwen3-4b-instruct');
    expect(served?.nodes).toEqual(pair);
    const after = await api.listNodes(INSTALLATION, { backend: 'kserve' });
    for (const name of pair) {
      expect(after.find(n => n.name === name)?.reservedBytes).toBe(
        12 * 1024 ** 3,
      );
    }
  });

  it('serves a failed model again rather than answering it as served', async () => {
    const { tools, api } = setup();
    const failed = (
      await api.listLoaded(INSTALLATION, { backend: 'kserve' })
    ).find(m => m.status === 'NotReady')!;
    const answer = await tools.loadModel({
      model: failed.name,
      backend: 'kserve',
    });
    expect(answer.alreadyServing).toBeUndefined();
    expect(answer.running?.phase).toBe('scheduling');
  });

  it("drops a removed backend's downloads with it", async () => {
    const { api, tools } = setup();
    expect(
      (await api.listJobs(INSTALLATION)).some(j => j.backend === 'kserve'),
    ).toBe(true);
    await tools.removeBackend('kserve');
    expect(
      (await api.listJobs(INSTALLATION)).some(j => j.backend === 'kserve'),
    ).toBe(false);
  });
});
