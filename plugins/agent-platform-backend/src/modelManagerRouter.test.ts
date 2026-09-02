import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockServices } from '@backstage/backend-test-utils';
import { NotAllowedError, NotFoundError } from '@backstage/errors';
import express from 'express';
import request from 'supertest';
import {
  MODEL_MANAGER_AUTH_HEADER,
  ModelManagerClient,
  PreconditionFailedError,
} from './ModelManagerClient';
import { createModelManagerRouter } from './modelManagerRouter';
import { createRouter } from './router';

const twoInstallations = {
  agentPlatform: {
    modelManager: {
      installations: {
        lab: { apiBaseUrl: 'https://agentgateway.lab.example/model-manager' },
        gpu: { apiBaseUrl: 'https://agentgateway.gpu.example/model-manager' },
      },
    },
  },
};

describe('createModelManagerRouter', () => {
  const methods = {
    getBackend: jest.fn(),
    listModels: jest.fn(),
    getModel: jest.fn(),
    deleteModel: jest.fn(),
    listLoaded: jest.fn(),
    pullModel: jest.fn(),
    loadModel: jest.fn(),
    unloadModel: jest.fn(),
    wireModel: jest.fn(),
    unwireModel: jest.fn(),
    listJobs: jest.fn(),
    getJob: jest.fn(),
    cancelJob: jest.fn(),
    fitCheck: jest.fn(),
    listPresets: jest.fn(),
    search: jest.fn(),
    listNodes: jest.fn(),
  };
  const mockClient = methods as unknown as ModelManagerClient;

  // Mirror the production setup: the backend's root HTTP router applies
  // MiddlewareFactory.error() after plugin routes, mapping @backstage/errors
  // classes to status codes.
  function buildApp(data: object = twoInstallations, withClient = true) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data });
    const router = createModelManagerRouter({
      logger,
      config,
      ...(withClient ? { client: mockClient } : {}),
    });
    const app = express();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  let app: express.Express;
  const auth = { [MODEL_MANAGER_AUTH_HEADER]: 'dex-token' };

  beforeEach(() => {
    Object.values(methods).forEach(fn => fn.mockReset());
    app = buildApp();
  });

  it('lists installations by name only, sorted, without URLs', async () => {
    const response = await request(app).get('/model-manager/installations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      installations: [{ name: 'gpu' }, { name: 'lab' }],
    });
    expect(JSON.stringify(response.body)).not.toContain('example');
  });

  it('answers an empty list when nothing is configured', async () => {
    const response = await request(buildApp({}, false)).get(
      '/model-manager/installations',
    );

    expect(response.body).toEqual({ installations: [] });
  });

  it('requires the installation query parameter and knows only configured ones', async () => {
    expect(
      (await request(app).get('/model-manager/backend').set(auth)).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .get('/model-manager/backend?installation=nope')
          .set(auth)
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app).get(
          '/model-manager/backend?installation=lab&installation=gpu',
        )
      ).status,
    ).toBe(400);
  });

  it('answers 503 for a data route when nothing is configured at all', async () => {
    const response = await request(buildApp({}, false))
      .get('/model-manager/backend?installation=lab')
      .set(auth);

    expect(response.status).toBe(503);
  });

  it('requires the user token on every data route', async () => {
    const response = await request(app).get(
      '/model-manager/models?installation=lab',
    );

    expect(response.status).toBe(401);
    expect(methods.listModels).not.toHaveBeenCalled();
  });

  it('forwards the token to the client for reads', async () => {
    methods.getBackend.mockResolvedValue({ backend: 'ollama' });
    methods.listModels.mockResolvedValue({ models: [] });
    methods.listLoaded.mockResolvedValue({ loaded: [] });
    methods.listJobs.mockResolvedValue({ jobs: [] });

    for (const path of ['backend', 'models', 'loaded', 'jobs']) {
      const response = await request(app)
        .get(`/model-manager/${path}?installation=lab`)
        .set(auth);
      expect(response.status).toBe(200);
    }

    expect(methods.getBackend).toHaveBeenCalledWith({ userToken: 'dex-token' });
    expect(methods.listModels).toHaveBeenCalledWith({ userToken: 'dex-token' });
    expect(methods.listLoaded).toHaveBeenCalledWith({ userToken: 'dex-token' });
    expect(methods.listJobs).toHaveBeenCalledWith({ userToken: 'dex-token' });
  });

  it('reassembles a model reference with slashes and colons from the wildcard path', async () => {
    methods.getModel.mockResolvedValue({ name: 'hf.co/org/repo:Q4_K_M' });

    const response = await request(app)
      .get('/model-manager/models/hf.co/org/repo%3AQ4_K_M?installation=lab')
      .set(auth);

    expect(response.status).toBe(200);
    expect(methods.getModel).toHaveBeenCalledWith('hf.co/org/repo:Q4_K_M', {
      userToken: 'dex-token',
    });
  });

  it('deletes with unwire by default and honours ?unwire=false', async () => {
    methods.deleteModel.mockResolvedValue({ deleted: true });

    await request(app)
      .delete('/model-manager/models/smollm2%3A135m?installation=lab')
      .set(auth);
    await request(app)
      .delete(
        '/model-manager/models/smollm2%3A135m?installation=lab&unwire=false',
      )
      .set(auth);
    const bad = await request(app)
      .delete('/model-manager/models/smollm2%3A135m?installation=lab&unwire=x')
      .set(auth);

    expect(methods.deleteModel).toHaveBeenNthCalledWith(
      1,
      'smollm2:135m',
      true,
      {
        userToken: 'dex-token',
      },
    );
    expect(methods.deleteModel).toHaveBeenNthCalledWith(
      2,
      'smollm2:135m',
      false,
      { userToken: 'dex-token' },
    );
    expect(bad.status).toBe(400);
  });

  it('starts a pull with 202 and forwards the wire flag only when given', async () => {
    methods.pullModel.mockResolvedValue({ job: { id: 'j1' }, created: true });

    const response = await request(app)
      .post('/model-manager/models/pull?installation=lab')
      .set(auth)
      .send({ model: '  smollm2:135m ' });
    const withWire = await request(app)
      .post('/model-manager/models/pull?installation=lab')
      .set(auth)
      .send({ model: 'smollm2:135m', wire: false });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ job: { id: 'j1' }, created: true });
    expect(methods.pullModel).toHaveBeenNthCalledWith(
      1,
      { model: 'smollm2:135m' },
      { userToken: 'dex-token' },
    );
    expect(withWire.status).toBe(202);
    expect(methods.pullModel).toHaveBeenNthCalledWith(
      2,
      { model: 'smollm2:135m', wire: false },
      { userToken: 'dex-token' },
    );
  });

  it.each([
    [{}, /model must be a string/],
    [{ model: '   ' }, /must not be empty/],
    [{ model: 'has space:1b' }, /model reference/],
    [{ model: '../etc' }, /model reference/],
    [{ model: 'x'.repeat(300) }, /at most 255/],
    [{ model: 'ok:1b', wire: 'yes' }, /wire must be a boolean/],
  ])('rejects a malformed pull body %j', async (body, message) => {
    const response = await request(app)
      .post('/model-manager/models/pull?installation=lab')
      .set(auth)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(message);
    expect(methods.pullModel).not.toHaveBeenCalled();
  });

  it('forwards the kserve preset and node of a pull, ignoring blanks', async () => {
    methods.pullModel.mockResolvedValue({ job: { id: 'j2' }, created: true });

    const response = await request(app)
      .post('/model-manager/models/pull?installation=gpu')
      .set(auth)
      .send({
        model: 'Qwen/Qwen3-14B',
        preset: ' qwen3-14b ',
        node: 'gpu-node-1',
      });
    const blanks = await request(app)
      .post('/model-manager/models/pull?installation=gpu')
      .set(auth)
      .send({ model: 'Qwen/Qwen3-14B', preset: '', node: '' });

    expect(response.status).toBe(202);
    expect(methods.pullModel).toHaveBeenNthCalledWith(
      1,
      { model: 'Qwen/Qwen3-14B', preset: 'qwen3-14b', node: 'gpu-node-1' },
      { userToken: 'dex-token' },
    );
    expect(blanks.status).toBe(202);
    expect(methods.pullModel).toHaveBeenNthCalledWith(
      2,
      { model: 'Qwen/Qwen3-14B' },
      { userToken: 'dex-token' },
    );
  });

  it.each([
    [
      { model: 'x:1b', preset: 'Has Spaces' },
      /preset must be a Kubernetes name/,
    ],
    [{ model: 'x:1b', node: '../etc' }, /node must be a Kubernetes name/],
    [{ model: 'x:1b', node: 42 }, /node must be a string/],
    [{ model: 'x:1b', preset: 'a'.repeat(300) }, /at most 253/],
  ])('rejects a malformed kserve field %j', async (body, message) => {
    const response = await request(app)
      .post('/model-manager/models/pull?installation=gpu')
      .set(auth)
      .send(body);

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(message);
    expect(methods.pullModel).not.toHaveBeenCalled();
  });

  it('loads by preset alone on kserve, and refuses a load naming neither', async () => {
    methods.loadModel.mockResolvedValue({
      name: 'Qwen/Qwen3-14B',
      loaded: true,
    });

    const byPreset = await request(app)
      .post('/model-manager/models/load?installation=gpu')
      .set(auth)
      .send({ preset: 'qwen3-14b', node: 'gpu-node-1' });
    const neither = await request(app)
      .post('/model-manager/models/load?installation=gpu')
      .set(auth)
      .send({ keepAlive: '10m' });

    expect(byPreset.status).toBe(200);
    expect(methods.loadModel).toHaveBeenCalledWith(
      { preset: 'qwen3-14b', node: 'gpu-node-1' },
      { userToken: 'dex-token' },
    );
    expect(neither.status).toBe(400);
    expect(neither.body.error.message).toMatch(/model or preset is required/);
  });

  it('runs a fit check and answers the verdict verbatim', async () => {
    methods.fitCheck.mockResolvedValue({
      model: 'Qwen/Qwen3-14B',
      fits: false,
      reason: 'needs 58 GiB, 40 GiB free',
    });

    const response = await request(app)
      .post('/model-manager/models/fit-check?installation=gpu')
      .set(auth)
      .send({ model: 'Qwen/Qwen3-14B', node: 'gpu-node-1' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      model: 'Qwen/Qwen3-14B',
      fits: false,
      reason: 'needs 58 GiB, 40 GiB free',
    });
    expect(methods.fitCheck).toHaveBeenCalledWith(
      { model: 'Qwen/Qwen3-14B', node: 'gpu-node-1' },
      { userToken: 'dex-token' },
    );
  });

  it('serves presets, nodes and a validated hub search', async () => {
    methods.listPresets.mockResolvedValue({ presets: [{ name: 'qwen3-14b' }] });
    methods.listNodes.mockResolvedValue({ nodes: [{ name: 'gpu-node-1' }] });
    methods.search.mockResolvedValue({ results: [{ id: 'Qwen/Qwen3-14B' }] });

    const presets = await request(app)
      .get('/model-manager/presets?installation=gpu')
      .set(auth);
    const nodes = await request(app)
      .get('/model-manager/nodes?installation=gpu')
      .set(auth);
    const search = await request(app)
      .get(
        '/model-manager/search?installation=gpu&q=%20qwen3%2014b%20&limit=10',
      )
      .set(auth);
    const noQuery = await request(app)
      .get('/model-manager/search?installation=gpu')
      .set(auth);
    const badLimit = await request(app)
      .get('/model-manager/search?installation=gpu&q=qwen&limit=500')
      .set(auth);

    expect(presets.body).toEqual({ presets: [{ name: 'qwen3-14b' }] });
    expect(nodes.body).toEqual({ nodes: [{ name: 'gpu-node-1' }] });
    expect(search.status).toBe(200);
    expect(methods.search).toHaveBeenCalledWith('qwen3 14b', 10, {
      userToken: 'dex-token',
    });
    expect(noQuery.status).toBe(400);
    expect(noQuery.body.error.message).toMatch(/q query parameter is required/);
    expect(badLimit.status).toBe(400);
    expect(badLimit.body.error.message).toMatch(/between 1 and 50/);
  });

  it('accepts Hugging Face GGUF references', async () => {
    methods.pullModel.mockResolvedValue({ job: {}, created: true });

    const response = await request(app)
      .post('/model-manager/models/pull?installation=lab')
      .set(auth)
      .send({ model: 'hf.co/bartowski/SmolLM2-135M-Instruct-GGUF:Q8_0' });

    expect(response.status).toBe(202);
  });

  it('loads with an optional keepAlive', async () => {
    methods.loadModel.mockResolvedValue({ name: 'qwen3:0.6b', loaded: true });

    const plain = await request(app)
      .post('/model-manager/models/load?installation=lab')
      .set(auth)
      .send({ model: 'qwen3:0.6b' });
    const kept = await request(app)
      .post('/model-manager/models/load?installation=lab')
      .set(auth)
      .send({ model: 'qwen3:0.6b', keepAlive: '-1' });
    const bad = await request(app)
      .post('/model-manager/models/load?installation=lab')
      .set(auth)
      .send({ model: 'qwen3:0.6b', keepAlive: 5 });

    expect(plain.status).toBe(200);
    expect(methods.loadModel).toHaveBeenNthCalledWith(
      1,
      { model: 'qwen3:0.6b' },
      { userToken: 'dex-token' },
    );
    expect(methods.loadModel).toHaveBeenNthCalledWith(
      2,
      { model: 'qwen3:0.6b', keepAlive: '-1' },
      { userToken: 'dex-token' },
    );
    expect(kept.status).toBe(200);
    expect(bad.status).toBe(400);
  });

  it.each([
    ['unload', 'unloadModel'],
    ['wire', 'wireModel'],
    ['unwire', 'unwireModel'],
  ] as const)('forwards %s with the model reference', async (op, method) => {
    methods[method].mockResolvedValue({ model: 'qwen3:0.6b' });

    const response = await request(app)
      .post(`/model-manager/models/${op}?installation=lab`)
      .set(auth)
      .send({ model: 'qwen3:0.6b' });

    expect(response.status).toBe(200);
    expect(methods[method]).toHaveBeenCalledWith(
      { model: 'qwen3:0.6b' },
      { userToken: 'dex-token' },
    );
  });

  it('is not fooled into reading a model called "pull"', async () => {
    // The operation routes are registered first; a GET on their path still
    // reaches the wildcard, which is the documented ambiguity of the upstream
    // API too — but a POST never falls through to the wildcard.
    methods.getModel.mockResolvedValue({ name: 'pull' });

    const response = await request(app)
      .get('/model-manager/models/pull?installation=lab')
      .set(auth);

    expect(response.status).toBe(200);
    expect(methods.getModel).toHaveBeenCalledWith('pull', {
      userToken: 'dex-token',
    });
    expect(methods.pullModel).not.toHaveBeenCalled();
  });

  it('reads and cancels jobs by id', async () => {
    methods.getJob.mockResolvedValue({ id: 'j1', phase: 'running' });
    methods.cancelJob.mockResolvedValue({ id: 'j1', phase: 'cancelled' });

    const got = await request(app)
      .get('/model-manager/jobs/j1?installation=lab')
      .set(auth);
    const cancelled = await request(app)
      .delete('/model-manager/jobs/j1?installation=lab')
      .set(auth);

    expect(got.body).toEqual({ id: 'j1', phase: 'running' });
    expect(cancelled.body).toEqual({ id: 'j1', phase: 'cancelled' });
    expect(methods.getJob).toHaveBeenCalledWith('j1', {
      userToken: 'dex-token',
    });
    expect(methods.cancelJob).toHaveBeenCalledWith('j1', {
      userToken: 'dex-token',
    });
  });

  it('maps client errors onto their status codes', async () => {
    methods.getModel.mockRejectedValue(new NotFoundError('no such model'));
    methods.deleteModel.mockRejectedValue(
      new NotAllowedError('Capability not supported by the backend'),
    );
    methods.loadModel.mockRejectedValue(
      new PreconditionFailedError('needs 105 GiB, node spark has 86 GiB'),
    );

    const missing = await request(app)
      .get('/model-manager/models/nope?installation=lab')
      .set(auth);
    const unsupported = await request(app)
      .delete('/model-manager/models/nope?installation=lab')
      .set(auth);
    const unfit = await request(app)
      .post('/model-manager/models/load?installation=lab')
      .set(auth)
      .send({ preset: 'nemotron' });

    expect(missing.status).toBe(404);
    expect(unsupported.status).toBe(403);
    expect(unsupported.body.error.message).toMatch(/Capability not supported/);
    // A refused fit is the caller's problem to read, not a 503.
    expect(unfit.status).toBe(412);
    expect(unfit.body.error.name).toBe('PreconditionFailedError');
    expect(unfit.body.error.message).toMatch(/needs 105 GiB/);
  });
});

describe('createRouter mounts the model-manager routes', () => {
  it('serves /model-manager/installations beside the kagent routes', async () => {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: twoInstallations });
    const router = await createRouter({ logger, config });
    const app = express();
    app.use(router);

    const kagent = await request(app).get('/kagent/installations');
    const modelManager = await request(app).get('/model-manager/installations');

    expect(kagent.body).toEqual({ installations: [] });
    expect(modelManager.body).toEqual({
      installations: [{ name: 'gpu' }, { name: 'lab' }],
    });
  });
});
