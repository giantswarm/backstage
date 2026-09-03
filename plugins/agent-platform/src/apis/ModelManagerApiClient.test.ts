import { DiscoveryApi, FetchApi } from '@backstage/core-plugin-api';
import {
  KubernetesApi,
  KubernetesAuthProvidersApi,
} from '@backstage/plugin-kubernetes-react';
import backendOllama from '../lib/__fixtures__/model-manager.backend.ollama.json';
import modelsOllama from '../lib/__fixtures__/model-manager.models.ollama.json';
import jobs from '../lib/__fixtures__/model-manager.jobs.json';
import { MODEL_MANAGER_AUTH_HEADER } from './ModelManagerApi';
import { ModelManagerApiClient } from './ModelManagerApiClient';

describe('ModelManagerApiClient', () => {
  const fetchMock = jest.fn();
  const getCluster = jest.fn();
  const getCredentials = jest.fn();

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
      discoveryApi,
      fetchApi,
      kubernetesApi,
      kubernetesAuthProvidersApi,
    });
  }

  function jsonResponse(body: unknown, status = 200) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    getCluster.mockReset();
    getCredentials.mockReset();
    getCluster.mockResolvedValue({
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-lab',
    });
    getCredentials.mockResolvedValue({ token: 'dex-token' });
  });

  it('lists installations without minting any token', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ installations: [{ name: 'lab' }, { name: 'gpu' }] }),
    );

    const installations = await buildClient().listInstallations();

    expect(installations).toEqual(['lab', 'gpu']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'http://backend/api/agent-platform/model-manager/installations',
    );
    expect(init.headers[MODEL_MANAGER_AUTH_HEADER]).toBeUndefined();
    expect(getCredentials).not.toHaveBeenCalled();
  });

  it('targets the installation and forwards the minted token in its own header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(backendOllama));

    const backend = await buildClient().getBackend('lab');

    expect(backend.backend).toBe('ollama');
    expect(backend.capabilities.pull).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'http://backend/api/agent-platform/model-manager/backend?installation=lab',
    );
    expect(init.headers[MODEL_MANAGER_AUTH_HEADER]).toBe('dex-token');
    expect(init.headers.Authorization).toBeUndefined();
    expect(getCredentials).toHaveBeenCalledWith('oidc.oidc-lab');
  });

  it('fails only the installation whose token cannot be minted', async () => {
    getCredentials.mockResolvedValue({ token: undefined });

    await expect(buildClient().listModels('lab')).rejects.toThrow(
      /Could not obtain an access token for "lab"/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses the inventory, dropping rows it cannot read', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        models: [...modelsOllama.models, { sizeBytes: 5 }],
      }),
    );

    const models = await buildClient().listModels('lab');

    expect(models.map(model => model.name)).toEqual([
      'qwen3.5:9b',
      'qwen3:0.6b',
      'gemma3:270m',
    ]);
  });

  it('starts a pull and answers the job with whether it was created', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ job: jobs.jobs[0], created: false }, 202),
    );

    const result = await buildClient().pullModel('lab', {
      model: 'qwen2.5:0.5b',
      wire: true,
    });

    expect(result.created).toBe(false);
    expect(result.job.id).toBe('910aff50c27e666b');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'http://backend/api/agent-platform/model-manager/models/pull?installation=lab',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      model: 'qwen2.5:0.5b',
      wire: true,
    });
  });

  it('refuses a pull answer without a job to follow', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ created: true }, 202));

    await expect(
      buildClient().pullModel('lab', { model: 'x:1b' }),
    ).rejects.toMatchObject({
      name: 'UpstreamError',
      message: expect.stringContaining('did not return a job'),
    });
  });

  it('encodes the model reference into one path segment for delete, and only sends unwire=false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ deleted: true }));

    await buildClient().deleteModel('lab', 'hf.co/org/repo:Q4_K_M');
    await buildClient().deleteModel('lab', 'smollm2:135m', { unwire: false });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://backend/api/agent-platform/model-manager/models/hf.co%2Forg%2Frepo%3AQ4_K_M?installation=lab',
    );
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[1][0]).toBe(
      'http://backend/api/agent-platform/model-manager/models/smollm2%3A135m?unwire=false&installation=lab',
    );
  });

  it('posts load, unload, wire and unwire with the model reference', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ name: 'qwen3:0.6b', loaded: true }),
    );

    const loaded = await buildClient().loadModel('lab', {
      model: 'qwen3:0.6b',
      keepAlive: '10m',
    });
    await buildClient().unloadModel('lab', 'qwen3:0.6b');
    fetchMock.mockResolvedValue(
      jsonResponse({
        model: 'qwen3:0.6b',
        modelConfig: { name: 'qwen3-0-6b', namespace: 'kagent', ready: false },
      }),
    );
    const wired = await buildClient().wireModel('lab', 'qwen3:0.6b');
    fetchMock.mockResolvedValue(
      jsonResponse({ model: 'qwen3:0.6b', modelConfig: null }),
    );
    await buildClient().unwireModel('lab', 'qwen3:0.6b');

    expect(loaded.loaded).toBe(true);
    expect(wired).toMatchObject({ name: 'qwen3-0-6b', namespace: 'kagent' });
    const paths = fetchMock.mock.calls.map(([url]) =>
      new URL(url).pathname.replace('/api/agent-platform', ''),
    );
    expect(paths).toEqual([
      '/model-manager/models/load',
      '/model-manager/models/unload',
      '/model-manager/models/wire',
      '/model-manager/models/unwire',
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      model: 'qwen3:0.6b',
      keepAlive: '10m',
    });
  });

  it('reads and cancels jobs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(jobs));
    fetchMock.mockResolvedValueOnce(jsonResponse(jobs.jobs[1]));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ ...jobs.jobs[1], phase: 'cancelled' }),
    );

    const list = await buildClient().listJobs('lab');
    const one = await buildClient().getJob('lab', '4104e3dc0b52e0f3');
    const cancelled = await buildClient().cancelJob('lab', '4104e3dc0b52e0f3');

    expect(list).toHaveLength(2);
    expect(one.model).toBe('smollm2:135m');
    expect(cancelled.phase).toBe('cancelled');
    expect(fetchMock.mock.calls[2][0]).toBe(
      'http://backend/api/agent-platform/model-manager/jobs/4104e3dc0b52e0f3?installation=lab',
    );
    expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
  });

  it('tolerates an empty success body on a write', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('no body');
      },
    } as unknown as Response);

    await expect(
      buildClient().unloadModel('lab', 'qwen3:0.6b'),
    ).resolves.toBeUndefined();
  });

  describe('error names', () => {
    it.each([
      [401, 'UnauthorizedError'],
      [403, 'ForbiddenError'],
      [404, 'NotFoundError'],
      [409, 'ConflictError'],
      [503, 'ServiceUnavailableError'],
    ])('maps %s to %s with the proxy message', async (status, name) => {
      fetchMock.mockResolvedValue(
        jsonResponse({ error: { message: `proxy said ${status}` } }, status),
      );

      await expect(buildClient().listModels('lab')).rejects.toMatchObject({
        name,
        message: `proxy said ${status}`,
      });
    });

    it('reads an unknown-installation 400 as "no model-manager here"', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          {
            error: {
              message:
                "Unknown model-manager installation 'lab'; configured installations: gpu",
            },
          },
          400,
        ),
      );

      await expect(buildClient().getBackend('lab')).rejects.toMatchObject({
        name: 'NotFoundError',
      });
    });

    it('keeps a validation 400 as a plain error with its message', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(
          { error: { message: 'model must be a model reference such as …' } },
          400,
        ),
      );

      await expect(
        buildClient().pullModel('lab', { model: 'bad ref' }),
      ).rejects.toMatchObject({
        name: 'Error',
        message: expect.stringContaining('model must be a model reference'),
      });
    });
  });
});
