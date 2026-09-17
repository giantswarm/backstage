import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import type { MusterApi } from '@giantswarm/backstage-plugin-muster';
import backendOllama from '../lib/__fixtures__/model-manager.backend.ollama.json';
import modelsOllama from '../lib/__fixtures__/model-manager.models.ollama.json';
import jobs from '../lib/__fixtures__/model-manager.jobs.json';
import { ModelManagerNotConnectedError } from '../lib/modelManagerBackends';
import { SERVED_MODEL_AUTH_HEADER } from './ModelManagerApi';
import {
  ModelManagerApiClient,
  SERVED_MODEL_TRY_PATH,
} from './ModelManagerApiClient';

describe('ModelManagerApiClient', () => {
  const callTool = jest.fn();
  const fetchMock = jest.fn();
  const getCluster = jest.fn();
  const getCredentials = jest.fn();

  const musterApi = { callTool } as unknown as MusterApi;
  const discoveryApi: DiscoveryApi = {
    getBaseUrl: async () => 'http://backend/api/agent-platform',
  };
  const fetchApi = { fetch: fetchMock } as unknown as FetchApi;
  const kubernetesApi = { getCluster } as unknown as KubernetesApi;
  const kubernetesAuthProvidersApi = {
    getCredentials,
  } as unknown as KubernetesAuthProvidersApi;

  function buildClient() {
    return new ModelManagerApiClient({
      musterApi,
      discoveryApi,
      fetchApi,
      kubernetesApi,
      kubernetesAuthProvidersApi,
    });
  }

  /** The tool names and arguments of every call so far, in order. */
  function calls() {
    return callTool.mock.calls.map(([name, args, installation]) => ({
      name,
      args,
      installation,
    }));
  }

  beforeEach(() => {
    callTool.mockReset();
    fetchMock.mockReset();
    getCluster.mockReset();
    getCredentials.mockReset();
    getCluster.mockResolvedValue({
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-lab',
    });
    getCredentials.mockResolvedValue({ token: 'dex-token' });
  });

  it('calls every read as an x_model-manager tool on the installation, through muster as the person', async () => {
    callTool.mockResolvedValue({ backends: [backendOllama] });

    const backends = await buildClient().listBackends('lab');

    expect(backends).toHaveLength(1);
    expect(backends[0].backend).toBe('ollama');
    expect(backends[0].capabilities.pull).toBe(true);
    expect(calls()).toEqual([
      { name: 'x_model-manager_list_backends', args: {}, installation: 'lab' },
    ]);
    // No REST, no token of its own: the muster client carries the person.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it('parses a tool that answered its JSON as text', async () => {
    callTool.mockResolvedValue(JSON.stringify(backendOllama));

    const backend = await buildClient().getBackend('lab');

    expect(backend.backend).toBe('ollama');
    expect(calls()[0].name).toBe('x_model-manager_get_backend');
  });

  it('answers an empty list for a model-manager with no backend registered yet, and refuses an answer without one', async () => {
    callTool.mockResolvedValueOnce({ backends: null });
    await expect(buildClient().listBackends('lab')).resolves.toEqual([]);

    callTool.mockResolvedValueOnce({ unexpected: true });
    await expect(buildClient().listBackends('lab')).rejects.toMatchObject({
      name: 'UpstreamError',
    });
  });

  it('parses the inventory, dropping rows it cannot read', async () => {
    callTool.mockResolvedValue({
      models: [...modelsOllama.models, { loaded: true }],
    });

    const models = await buildClient().listModels('lab');

    expect(models).toHaveLength(modelsOllama.models.length);
    expect(models.map(model => model.name)).toEqual(
      modelsOllama.models.map(model => model.name),
    );
  });

  it('scopes reads and mutations to a backend only when asked', async () => {
    callTool.mockResolvedValue({ models: [] });
    const client = buildClient();

    await client.listModels('lab');
    await client.listModels('lab', { backend: 'lemonade' });
    await client.listPresets('lab', { backend: 'kserve' });
    await client.listNodes('lab');
    await client.listLoaded('lab', { backend: 'ollama' });
    await client.unloadModel('lab', 'qwen3:0.6b', { backend: 'ollama' });

    expect(calls()).toEqual([
      { name: 'x_model-manager_list_models', args: {}, installation: 'lab' },
      {
        name: 'x_model-manager_list_models',
        args: { backend: 'lemonade' },
        installation: 'lab',
      },
      {
        name: 'x_model-manager_list_presets',
        args: { backend: 'kserve' },
        installation: 'lab',
      },
      { name: 'x_model-manager_list_nodes', args: {}, installation: 'lab' },
      {
        name: 'x_model-manager_list_loaded_models',
        args: { backend: 'ollama' },
        installation: 'lab',
      },
      {
        name: 'x_model-manager_unload_model',
        args: { model: 'qwen3:0.6b', backend: 'ollama' },
        installation: 'lab',
      },
    ]);
  });

  it('starts a pull and answers the job with whether it was created', async () => {
    callTool.mockResolvedValue({ job: jobs.jobs[0], created: false });

    const pulled = await buildClient().pullModel('lab', {
      model: 'qwen2.5:0.5b',
      wire: false,
      preset: 'qwen3-4b-instruct',
      node: undefined,
    });

    expect(pulled.created).toBe(false);
    expect(pulled.job.id).toBe('910aff50c27e666b');
    expect(calls()).toEqual([
      {
        name: 'x_model-manager_pull_model',
        // Fields the caller left out are not sent as null.
        args: {
          model: 'qwen2.5:0.5b',
          wire: false,
          preset: 'qwen3-4b-instruct',
        },
        installation: 'lab',
      },
    ]);
  });

  it('refuses a pull answer without a job to follow', async () => {
    callTool.mockResolvedValue({ created: true });

    await expect(
      buildClient().pullModel('lab', { model: 'x' }),
    ).rejects.toMatchObject({ name: 'UpstreamError' });
  });

  it('deletes with the model reference, and only sends unwire=false', async () => {
    callTool.mockResolvedValue({ deleted: true });
    const client = buildClient();

    await client.deleteModel('lab', 'hf.co/org/repo:Q4_K_M');
    await client.deleteModel('lab', 'smollm2:135m', { unwire: false });
    await client.deleteModel('lab', 'smollm2:135m', {
      unwire: true,
      backend: 'ollama',
    });

    expect(calls().map(call => call.args)).toEqual([
      { model: 'hf.co/org/repo:Q4_K_M' },
      { model: 'smollm2:135m', unwire: false },
      { model: 'smollm2:135m', backend: 'ollama' },
    ]);
    expect(
      calls().every(call => call.name === 'x_model-manager_delete_model'),
    ).toBe(true);
  });

  it('loads, wires and unwires with the model reference, by preset where given', async () => {
    callTool.mockResolvedValueOnce({ name: 'qwen3:0.6b', loaded: true });
    const loaded = await buildClient().loadModel('lab', {
      model: 'qwen3:0.6b',
      keepAlive: '10m',
    });
    callTool.mockResolvedValueOnce({
      name: 'qwen3-4b-instruct',
      loaded: false,
    });
    await buildClient().loadModel('gpu', {
      preset: 'qwen3-4b-instruct',
      backend: 'kserve',
    });
    callTool.mockResolvedValueOnce({
      model: 'qwen3:0.6b',
      modelConfig: { name: 'qwen3-0-6b', namespace: 'kagent', ready: false },
    });
    const wired = await buildClient().wireModel('lab', 'qwen3:0.6b');
    callTool.mockResolvedValueOnce({ model: 'qwen3:0.6b', modelConfig: null });
    await buildClient().unwireModel('lab', 'qwen3:0.6b');

    expect(loaded.loaded).toBe(true);
    expect(wired).toMatchObject({ name: 'qwen3-0-6b', namespace: 'kagent' });
    expect(calls()).toEqual([
      {
        name: 'x_model-manager_load_model',
        args: { model: 'qwen3:0.6b', keepAlive: '10m' },
        installation: 'lab',
      },
      {
        name: 'x_model-manager_load_model',
        args: { preset: 'qwen3-4b-instruct', backend: 'kserve' },
        installation: 'gpu',
      },
      {
        name: 'x_model-manager_wire_model',
        args: { model: 'qwen3:0.6b' },
        installation: 'lab',
      },
      {
        name: 'x_model-manager_unwire_model',
        args: { model: 'qwen3:0.6b' },
        installation: 'lab',
      },
    ]);
  });

  it('checks a fit by model or preset and searches the hub with a limit', async () => {
    callTool.mockResolvedValueOnce({ model: 'Qwen/Qwen3-4B', fits: true });
    const fit = await buildClient().fitCheck('gpu', {
      model: 'Qwen/Qwen3-4B',
      preset: 'qwen3-4b-instruct',
      node: 'gpu-node-1',
      backend: 'kserve',
    });
    callTool.mockResolvedValueOnce({
      query: 'qwen',
      results: [{ id: 'Qwen/Qwen3-4B', downloads: 10 }],
    });
    const hits = await buildClient().searchModels('gpu', 'qwen', 5);

    expect(fit.fits).toBe(true);
    expect(hits.map(hit => hit.id)).toEqual(['Qwen/Qwen3-4B']);
    expect(calls()).toEqual([
      {
        name: 'x_model-manager_check_fit',
        args: {
          model: 'Qwen/Qwen3-4B',
          preset: 'qwen3-4b-instruct',
          node: 'gpu-node-1',
          backend: 'kserve',
        },
        installation: 'gpu',
      },
      {
        name: 'x_model-manager_search_models',
        args: { query: 'qwen', limit: 5 },
        installation: 'gpu',
      },
    ]);
  });

  it('reads and cancels jobs by id', async () => {
    callTool.mockResolvedValueOnce(jobs);
    callTool.mockResolvedValueOnce(jobs.jobs[1]);
    callTool.mockResolvedValueOnce({ ...jobs.jobs[1], phase: 'cancelled' });

    const list = await buildClient().listJobs('lab');
    const one = await buildClient().getJob('lab', '4104e3dc0b52e0f3');
    const cancelled = await buildClient().cancelJob('lab', '4104e3dc0b52e0f3');

    expect(list).toHaveLength(2);
    expect(one.model).toBe('smollm2:135m');
    expect(cancelled.phase).toBe('cancelled');
    expect(calls().slice(1)).toEqual([
      {
        name: 'x_model-manager_get_job',
        args: { id: '4104e3dc0b52e0f3' },
        installation: 'lab',
      },
      {
        name: 'x_model-manager_cancel_job',
        args: { id: '4104e3dc0b52e0f3' },
        installation: 'lab',
      },
    ]);
  });

  describe('error names', () => {
    it.each([
      ['not_found: model nope is not downloaded', 'NotFoundError'],
      ['unsupported: kserve does not pull by reference', 'ForbiddenError'],
      ['conflict: smollm2:135m exists on ollama and lemonade', 'ConflictError'],
      [
        'does_not_fit: needs 21.1 GB, the largest size has 22 GB usable',
        'PreconditionFailedError',
      ],
      [
        'backend_error: dial tcp: connection refused',
        'ServiceUnavailableError',
      ],
      ['invalid_request: model or preset is required', 'InputError'],
    ])(
      "maps model-manager's refusal %p to %s, message kept verbatim",
      async (message, name) => {
        callTool.mockRejectedValue(new Error(message));

        await expect(buildClient().listModels('lab')).rejects.toMatchObject({
          name,
          message,
        });
      },
    );

    it('keeps muster’s own answers: not connected, and its HTTP names', async () => {
      callTool.mockRejectedValueOnce(
        new Error('tool not found: x_model-manager_list_models'),
      );
      await expect(buildClient().listModels('lab')).rejects.toBeInstanceOf(
        ModelManagerNotConnectedError,
      );

      const unauthorized = new Error('muster: token rejected');
      unauthorized.name = 'UnauthorizedError';
      callTool.mockRejectedValueOnce(unauthorized);
      // A refusal without a status word keeps the class name, not muster's:
      // what matters to the callers is that it is not retried as transient.
      await expect(buildClient().listModels('lab')).rejects.toMatchObject({
        message: 'muster: token rejected',
      });
    });
  });

  describe('tryModel', () => {
    it('posts the try to the portal’s backend with the installation token in its own header', async () => {
      const answer = {
        url: 'https://models.example.test/model-serving/qwen/v1/chat/completions',
        model: 'qwen',
        without: { status: 401 },
        with: { status: 200, content: 'pong', latencyMs: 12 },
      };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => answer,
      } as Response);

      const result = await buildClient().tryModel('lab', {
        model: 'qwen',
        url: 'https://models.example.test/model-serving/qwen',
      });

      expect(result).toEqual(answer);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        `http://backend/api/agent-platform${SERVED_MODEL_TRY_PATH}`,
      );
      expect(init.method).toBe('POST');
      expect(init.headers[SERVED_MODEL_AUTH_HEADER]).toBe('dex-token');
      expect(JSON.parse(init.body)).toEqual({
        installation: 'lab',
        model: 'qwen',
        url: 'https://models.example.test/model-serving/qwen',
      });
      expect(callTool).not.toHaveBeenCalled();
    });

    it('surfaces the backend’s refusal with its message', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: "'x' is not under the installation's domain" },
        }),
      } as Response);

      await expect(
        buildClient().tryModel('lab', { model: 'qwen', url: 'https://x' }),
      ).rejects.toThrow(/not under the installation's domain/);
    });
  });
});
