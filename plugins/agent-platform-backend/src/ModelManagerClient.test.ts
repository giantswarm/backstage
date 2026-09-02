import { mockServices } from '@backstage/backend-test-utils';
import {
  encodeModelRef,
  ModelManagerClient,
  readModelManagerInstallationsFromConfig,
} from './ModelManagerClient';

describe('readModelManagerInstallationsFromConfig', () => {
  const logger = mockServices.logger.mock();

  function read(data: object) {
    return readModelManagerInstallationsFromConfig(
      mockServices.rootConfig({ data }),
      logger,
    );
  }

  it('reads every installation with an apiBaseUrl, stripping trailing slashes', () => {
    const result = read({
      agentPlatform: {
        modelManager: {
          installations: {
            lab: {
              apiBaseUrl: 'https://agentgateway.lab.example/model-manager/',
            },
            gpu: {
              apiBaseUrl: 'https://agentgateway.gpu.example/model-manager',
            },
          },
        },
      },
    });

    expect([...result.keys()]).toEqual(['lab', 'gpu']);
    expect(result.get('lab')?.apiBaseUrl).toBe(
      'https://agentgateway.lab.example/model-manager',
    );
  });

  it('derives nothing from gs.installations', () => {
    // Unlike kagent there is no well-known hostname to derive: model-manager is
    // optional and lives behind the gateway prefix.
    const result = read({
      gs: { installations: { gazelle: { baseDomain: 'gazelle.example.io' } } },
    });

    expect(result.size).toBe(0);
  });

  it('skips an entry without apiBaseUrl, and one that is not an absolute http URL', () => {
    const result = read({
      agentPlatform: {
        modelManager: {
          installations: {
            noUrl: {},
            relative: { apiBaseUrl: 'model-manager.agent-platform.svc:8080' },
            lab: { apiBaseUrl: 'http://model-manager.agent-platform.svc:8080' },
          },
        },
      },
    });

    expect([...result.keys()]).toEqual(['lab']);
  });
});

describe('encodeModelRef', () => {
  it('keeps the slashes of a Hugging Face reference and encodes each segment', () => {
    expect(encodeModelRef('hf.co/org/repo:Q4_K_M')).toBe(
      'hf.co/org/repo%3AQ4_K_M',
    );
    expect(encodeModelRef('smollm2:135m')).toBe('smollm2%3A135m');
  });
});

describe('ModelManagerClient', () => {
  const logger = mockServices.logger.mock();
  const fetchMock = jest.fn();
  const installation = {
    name: 'lab',
    apiBaseUrl: 'https://agentgateway.lab.example/model-manager',
  };

  function buildClient(timeoutMs = 10_000, loadTimeoutMs = 120_000) {
    return new ModelManagerClient(
      installation,
      logger,
      fetchMock as unknown as typeof fetch,
      timeoutMs,
      loadTimeoutMs,
    );
  }

  function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('forwards the user token as a bearer and answers the body verbatim', async () => {
    const backend = { backend: 'ollama', healthy: true, capabilities: {} };
    fetchMock.mockResolvedValue(jsonResponse(backend));

    const result = await buildClient().getBackend({ userToken: 'dex-token' });

    expect(result).toEqual(backend);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://agentgateway.lab.example/model-manager/api/v1/backend',
    );
    expect(init.headers.Authorization).toBe('Bearer dex-token');
    expect(init.redirect).toBe('manual');
  });

  it('sends no Authorization header without a token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ models: [] }));

    await buildClient().listModels({});

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('encodes a model reference per path segment for the get and delete routes', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ name: 'hf.co/org/repo:Q4' }),
    );

    await buildClient().getModel('hf.co/org/repo:Q4', { userToken: 't' });
    await buildClient().deleteModel('hf.co/org/repo:Q4', false, {
      userToken: 't',
    });
    await buildClient().deleteModel('smollm2:135m', true, { userToken: 't' });

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://agentgateway.lab.example/model-manager/api/v1/models/hf.co/org/repo%3AQ4',
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://agentgateway.lab.example/model-manager/api/v1/models/hf.co/org/repo%3AQ4?unwire=false',
    );
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    // The default (unwire) sends no query at all — model-manager's default.
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://agentgateway.lab.example/model-manager/api/v1/models/smollm2%3A135m',
    );
  });

  it('posts JSON bodies for the operations', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ job: { id: 'j1' }, created: true }),
    );

    await buildClient().pullModel(
      { model: 'smollm2:135m', wire: false },
      { userToken: 't' },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://agentgateway.lab.example/model-manager/api/v1/models/pull',
    );
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      model: 'smollm2:135m',
      wire: false,
    });
  });

  it('gives a load its own, longer timeout', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ name: 'x', loaded: true }),
    );
    const timeoutSpy = jest.spyOn(AbortSignal, 'timeout');

    await buildClient(5_000, 90_000).listModels({ userToken: 't' });
    await buildClient(5_000, 90_000).loadModel(
      { model: 'x' },
      { userToken: 't' },
    );

    expect(timeoutSpy).toHaveBeenNthCalledWith(1, 5_000);
    expect(timeoutSpy).toHaveBeenNthCalledWith(2, 90_000);
    timeoutSpy.mockRestore();
  });

  describe('error mapping', () => {
    const envelope = (code: string, message: string, status: number) =>
      jsonResponse({ error: { code, message } }, status);

    it.each([
      ['invalid_request', 400, 'InputError'],
      ['not_found', 404, 'NotFoundError'],
      ['conflict', 409, 'ConflictError'],
      ['unsupported', 501, 'NotAllowedError'],
      ['backend_error', 502, 'ServiceUnavailableError'],
    ])(
      "maps model-manager's %s envelope to %s",
      async (code, status, errorName) => {
        fetchMock.mockResolvedValue(
          envelope(code, `upstream says ${code}`, status),
        );

        await expect(
          buildClient().listModels({ userToken: 't' }),
        ).rejects.toMatchObject({
          name: errorName,
          message: expect.stringContaining(`upstream says ${code}`),
        });
      },
    );

    it('names the unsupported capability so the UI can say what is missing', async () => {
      fetchMock.mockResolvedValue(
        envelope('unsupported', 'delete is not supported by this backend', 501),
      );

      await expect(
        buildClient().deleteModel('x', true, { userToken: 't' }),
      ).rejects.toThrow(/Capability not supported.*delete is not supported/);
    });

    it('reads the status when a door in front of model-manager answers without an envelope', async () => {
      fetchMock.mockResolvedValueOnce(new Response('denied', { status: 401 }));
      await expect(
        buildClient().listModels({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'AuthenticationError' });

      fetchMock.mockResolvedValueOnce(new Response('denied', { status: 403 }));
      await expect(
        buildClient().listModels({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'NotAllowedError' });

      fetchMock.mockResolvedValueOnce(new Response('gone', { status: 404 }));
      await expect(
        buildClient().listModels({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'NotFoundError' });

      fetchMock.mockResolvedValueOnce(new Response('bad', { status: 502 }));
      await expect(
        buildClient().listModels({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'ServiceUnavailableError' });
    });

    it('treats a redirect as a rejected token, never following it', async () => {
      fetchMock.mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: 'https://dex.example/auth' },
        }),
      );

      await expect(
        buildClient().getBackend({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'AuthenticationError' });
    });

    it('treats a non-JSON 200 as a sign-in page', async () => {
      fetchMock.mockResolvedValue(
        new Response('<html>sign in</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      );

      await expect(
        buildClient().getBackend({ userToken: 't' }),
      ).rejects.toMatchObject({ name: 'AuthenticationError' });
    });

    it('reports an unreachable model-manager as unavailable, not as absent', async () => {
      // Installations are configured explicitly, so not reaching one is a fault
      // to surface — unlike the kagent proxy's derived fan-out.
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        buildClient().getBackend({ userToken: 't' }),
      ).rejects.toMatchObject({
        name: 'ServiceUnavailableError',
        message: expect.stringContaining('not reachable'),
      });
    });

    it('reports a timeout as unavailable with the budget', async () => {
      const timeout = new Error('aborted');
      timeout.name = 'TimeoutError';
      fetchMock.mockRejectedValue(timeout);

      await expect(
        buildClient(1_234).getBackend({ userToken: 't' }),
      ).rejects.toMatchObject({
        name: 'ServiceUnavailableError',
        message: expect.stringContaining('1234ms'),
      });
    });

    it('answers an empty 204 as undefined', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

      await expect(
        buildClient().cancelJob('j1', { userToken: 't' }),
      ).resolves.toBeUndefined();
    });
  });
});
