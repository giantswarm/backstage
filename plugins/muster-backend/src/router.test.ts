import { ServiceUnavailableError } from '@backstage/errors';
import { MiddlewareFactory } from '@backstage/backend-defaults/rootHttpRouter';
import { mockCredentials, mockServices } from '@backstage/backend-test-utils';
import { JsonObject } from '@backstage/types';
import express from 'express';
import request from 'supertest';
import {
  EndpointProbeResult,
  markReported,
  MusterAuthRequiredError,
  MusterInputRequiredError,
  MusterMcpClient,
  ReachabilityCache,
  MusterToolError,
  MusterUnreachableError,
} from '@giantswarm/backstage-plugin-gs-node';
import {
  createRouter,
  MUSTER_AUTH_HEADER,
  musterProbeUrl,
  RouterOptions,
} from './router';

const mockGetMcpUsage = jest.fn();
const mockGetMcpToolLatency = jest.fn();
const mockIsPartialUsage = jest.fn();
jest.mock('./mcpUsage', () => {
  const actual = jest.requireActual('./mcpUsage');
  return {
    ...actual,
    readMcpUsage: async (...args: unknown[]) => {
      const usage = await mockGetMcpUsage(...args);
      return { usage, complete: !mockIsPartialUsage(usage) };
    },
    getMcpToolLatency: (...args: unknown[]) => mockGetMcpToolLatency(...args),
  };
});

/**
 * A reachability cache that never touches the network: every endpoint answers
 * as reachable, immediately. Tests of the reachability fields build their own.
 */
function reachableEverywhere() {
  return new ReachabilityCache({
    probe: async () => ({ reachable: true, checkedAt: 0 }),
  });
}

/**
 * An app in the root HTTP router's query parser mode, `extended` (`qs`), which
 * turns bracket syntax into objects and more than 20 repeats of a parameter
 * into an index-keyed object. Express 5's default, `simple`, does neither. The
 * `qs` here is the hoisted copy, not the one inside backend-defaults.
 */
function expressApp() {
  const app = express();
  app.set('query parser', 'extended');
  return app;
}

describe('createRouter', () => {
  const callTool = jest.fn();
  const callToolWithProgress = jest.fn();
  const callToolWithStructured = jest.fn();
  const listTools = jest.fn();
  const filterTools = jest.fn();
  const filterResources = jest.fn();
  const filterPrompts = jest.fn();
  const describeTool = jest.fn();
  const listCoreTools = jest.fn();
  const getResource = jest.fn();
  const serverIcon = jest.fn();

  const mockClient = {
    callTool,
    callToolWithProgress,
    callToolWithStructured,
    listTools,
    filterTools,
    filterResources,
    filterPrompts,
    describeTool,
    listCoreTools,
    getResource,
    serverIcon,
  } as unknown as MusterMcpClient;

  // Mirror the production setup: the backend's root HTTP router applies
  // MiddlewareFactory.error() after plugin routes, mapping @backstage/errors
  // classes to status codes.
  async function buildApp(options: Partial<RouterOptions> = {}) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: {} });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      client: mockClient,
      reachability: reachableEverywhere(),
      ...options,
    });
    const app = expressApp();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  // Build an app with explicit muster.installations config, still backed by
  // the injected mock client for every installation.
  async function buildMultiApp(
    installations: JsonObject[],
    options: Partial<RouterOptions> = {},
  ) {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({
      data: { muster: { installations } },
    });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      client: mockClient,
      reachability: reachableEverywhere(),
      ...options,
    });
    const app = expressApp();
    app.use(router);
    app.use(MiddlewareFactory.create({ logger, config }).error());
    return app;
  }

  let app: express.Express;

  beforeEach(async () => {
    mockGetMcpUsage.mockReset();
    mockGetMcpToolLatency.mockReset();
    mockIsPartialUsage.mockReset().mockReturnValue(false);
    callTool.mockReset();
    callToolWithProgress.mockReset();
    callToolWithStructured.mockReset();
    listTools.mockReset();
    filterTools.mockReset();
    describeTool.mockReset();
    listCoreTools.mockReset();
    getResource.mockReset();
    serverIcon.mockReset();
    app = await buildApp();
  });

  it('reports health', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', configured: true });
  });

  it('proxies workflow list', async () => {
    const payload = { workflows: [{ name: 'wf-a', available: true }] };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get('/workflows');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith('core_workflow_list', {}, {});
  });

  it('proxies execution list with filters', async () => {
    const payload = { executions: [], total: 0 };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get(
      '/executions?workflow_name=wf-a&status=completed&limit=10&offset=20',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_execution_list',
      {
        workflow_name: 'wf-a',
        status: 'completed',
        limit: 10,
        offset: 20,
      },
      {},
    );
  });

  it('omits unset execution list filters', async () => {
    callTool.mockResolvedValue({ executions: [] });

    await request(app).get('/executions');

    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_execution_list',
      {},
      {},
    );
  });

  it('rejects an invalid execution status', async () => {
    const response = await request(app).get('/executions?status=bogus');

    expect(response.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('rejects a repeated status parameter', async () => {
    const response = await request(app).get(
      '/executions?status=completed&status=failed',
    );

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('at most once');
    expect(callTool).not.toHaveBeenCalled();
  });

  it.each([['workflow_name=a&workflow_name=b'], ['workflow_name[x]=a']])(
    'rejects a workflow_name that is not one string (%s)',
    async query => {
      const response = await request(app).get(`/executions?${query}`);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe(
        'workflow_name must be provided at most once',
      );
      expect(callTool).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-numeric limit', async () => {
    const response = await request(app).get('/executions?limit=abc');

    expect(response.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('rejects an empty limit', async () => {
    const response = await request(app).get('/executions?limit=');

    expect(response.status).toBe(400);
    expect(callTool).not.toHaveBeenCalled();
  });

  it.each([
    ['too many hours', '/usage?hours=2161'],
    // Gone: a stale client must not read 24 hours as the month.
    ['the month window', '/usage?window=month'],
    ['a server that is not a resource name', '/usage?server=a%22b'],
    ['an empty server', '/usage?server='],
    ['a tool with a control character', '/usage?tool=a%0Ab'],
    ['an overlong tool', `/usage?tool=${'t'.repeat(513)}`],
    ['an empty tool', '/usage?tool='],
    ['two tools', '/usage?tool=a&tool=b'],
    [
      'more servers than a read may name',
      `/usage?${Array.from({ length: 257 }, (_, i) => `server=s${i}`).join('&')}`,
    ],
  ])('rejects usage with %s', async (_, path) => {
    const response = await request(app).get(path);

    expect(response.status).toBe(400);
    expect(mockGetMcpUsage).not.toHaveBeenCalled();
  });

  it.each([
    ['/usage?hours=72', 72],
    ['/usage', 24],
  ])(
    'reads %s as the last %s hours of every connector',
    async (path, hours) => {
      mockGetMcpUsage.mockResolvedValueOnce({ available: false });

      const response = await request(app).get(path);

      expect(response.status).toBe(200);
      expect(mockGetMcpUsage).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        hours,
        [],
        undefined,
      );
    },
  );

  it('takes any tool name muster may expose, left to the escaping', async () => {
    mockGetMcpUsage.mockResolvedValueOnce({ available: false });

    const response = await request(app).get(
      `/usage?tool=${encodeURIComponent('x_legacy_get:item@v1 "a"}')}`,
    );

    expect(response.status).toBe(200);
    expect(mockGetMcpUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      24,
      [],
      'x_legacy_get:item@v1 "a"}',
    );
  });

  it('narrows usage to one tool of a connector', async () => {
    mockGetMcpUsage.mockResolvedValueOnce({ available: false });

    const response = await request(app).get(
      '/usage?hours=720&server=kagi&tool=x_kagi_search',
    );

    expect(response.status).toBe(200);
    expect(mockGetMcpUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      720,
      ['kagi'],
      'x_kagi_search',
    );
  });

  it("narrows usage to every server named, past the query parser's 20 repeats", async () => {
    mockGetMcpUsage.mockResolvedValueOnce({ available: false });
    const servers = Array.from(
      { length: 25 },
      (_, i) => `mc${i}-mcp-kubernetes`,
    );

    const response = await request(app).get(
      `/usage?hours=720&${servers.map(name => `server=${name}`).join('&')}`,
    );

    expect(response.status).toBe(200);
    expect(mockGetMcpUsage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      720,
      servers,
      undefined,
    );
  });

  describe('usage caching', () => {
    const available = { available: true, range_hours: 720 };

    afterEach(() => jest.restoreAllMocks());

    it('answers a repeated read from the cache until five minutes have passed', async () => {
      let now = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      mockGetMcpUsage.mockResolvedValue(available);

      await request(app).get('/usage?hours=720');
      now = 5 * 60_000 - 1;
      const cached = await request(app).get('/usage?hours=720');
      expect(cached.body).toEqual(available);
      expect(mockGetMcpUsage).toHaveBeenCalledTimes(1);

      now = 5 * 60_000;
      await request(app).get('/usage?hours=720');
      expect(mockGetMcpUsage).toHaveBeenCalledTimes(2);
    });

    it('keeps windows and narrowings apart', async () => {
      mockGetMcpUsage.mockResolvedValue(available);

      await request(app).get('/usage?hours=720');
      await request(app).get('/usage?hours=168');
      await request(app).get('/usage?hours=720&server=kagi');
      await request(app).get('/usage?hours=720&server=kagi&tool=x_kagi_search');

      expect(mockGetMcpUsage).toHaveBeenCalledTimes(4);
    });

    it('reads again after an unavailable answer', async () => {
      mockGetMcpUsage.mockResolvedValue({ available: false });

      await request(app).get('/usage?hours=720');
      await request(app).get('/usage?hours=720');

      expect(mockGetMcpUsage).toHaveBeenCalledTimes(2);
    });

    it('reads again after an answer a rollup was left out of', async () => {
      mockGetMcpUsage.mockResolvedValue(available);
      mockIsPartialUsage.mockReturnValue(true);

      await request(app).get('/usage?hours=720');
      await request(app).get('/usage?hours=720');

      expect(mockGetMcpUsage).toHaveBeenCalledTimes(2);
    });

    it("answers a person's reload from the cache, never another person's read", async () => {
      const multi = await buildMultiApp([
        {
          name: 'graveler',
          url: 'https://muster.graveler.example/mcp',
          authProvider: 'oidc-graveler',
        },
      ]);
      mockGetMcpUsage.mockResolvedValue(available);
      // Every full load forwards a newly minted ID token.
      let minted = 0;
      const idToken = () =>
        [
          Buffer.from('{"alg":"none"}').toString('base64url'),
          Buffer.from(
            JSON.stringify({
              sub: 'ada',
              iat: (minted += 1),
              exp: Math.floor(Date.now() / 1000) + 600,
            }),
          ).toString('base64url'),
          'sig',
        ].join('.');

      for (const user of ['ada', 'ada', 'grace']) {
        const response = await request(multi)
          .get('/usage?installation=graveler&hours=720')
          .set(
            'Authorization',
            mockCredentials.user.header(`user:default/${user}`),
          )
          .set(MUSTER_AUTH_HEADER, idToken());
        expect(response.status).toBe(200);
      }

      expect(mockGetMcpUsage).toHaveBeenCalledTimes(2);
    });
  });

  it('caches nothing for the guest user, whom several people share', async () => {
    mockGetMcpUsage.mockResolvedValue({ available: true });
    mockGetMcpToolLatency.mockResolvedValue({ available: true, tools: [] });
    const guest = mockCredentials.user.header('user:default/guest');

    for (let read = 0; read < 2; read += 1) {
      await request(app).get('/usage?hours=720').set('Authorization', guest);
      await request(app)
        .get('/usage/tool-latency?hours=720')
        .set('Authorization', guest);
    }

    expect(mockGetMcpUsage).toHaveBeenCalledTimes(2);
    expect(mockGetMcpToolLatency).toHaveBeenCalledTimes(2);
  });

  it('looks the prometheus server up again after a read through it failed', async () => {
    callTool.mockResolvedValue({
      mcpServers: [{ name: 'gazelle-mcp-prometheus', state: 'Connected' }],
    });
    mockGetMcpUsage
      .mockResolvedValueOnce({ available: false, reason: 'query failed' })
      .mockResolvedValueOnce({ available: true });

    await request(app).get('/usage?hours=720');
    await request(app).get('/usage?hours=720');

    expect(
      callTool.mock.calls.filter(([name]) => name === 'core_mcpserver_list'),
    ).toHaveLength(2);
  });

  it('finds the prometheus server once for the usage reads a page makes', async () => {
    callTool.mockResolvedValue({
      mcpServers: [{ name: 'gazelle-mcp-prometheus', state: 'Connected' }],
    });
    mockGetMcpUsage.mockResolvedValue({ available: true });
    mockGetMcpToolLatency.mockResolvedValue({ available: true, tools: [] });

    await Promise.all([
      request(app).get('/usage?hours=720'),
      request(app).get('/usage/tool-latency?hours=720'),
    ]);
    await request(app).get('/usage?hours=168');

    expect(
      callTool.mock.calls.filter(([name]) => name === 'core_mcpserver_list'),
    ).toHaveLength(1);
    for (const read of [mockGetMcpUsage, mockGetMcpToolLatency]) {
      for (const [, installation] of read.mock.calls) {
        expect(installation).toMatchObject({
          prometheusServer: 'gazelle-mcp-prometheus',
        });
      }
    }
  });

  describe('/usage/tool-latency', () => {
    it('reads every tool’s p95 over the window and connectors, and caches it', async () => {
      const latency = {
        available: true,
        range_hours: 720,
        tools: [{ tool: 'x_kagi_search', p95_seconds: 1.2 }],
      };
      mockGetMcpToolLatency.mockResolvedValue(latency);

      const response = await request(app).get(
        '/usage/tool-latency?hours=720&server=kagi',
      );
      await request(app).get('/usage/tool-latency?hours=720&server=kagi');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(latency);
      expect(mockGetMcpToolLatency).toHaveBeenCalledTimes(1);
      expect(mockGetMcpToolLatency).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        720,
        ['kagi'],
      );
      expect(mockGetMcpUsage).not.toHaveBeenCalled();
    });

    it.each([
      ['a tool, which /usage answers itself', '/usage/tool-latency?tool=x'],
      ['a window out of range', '/usage/tool-latency?hours=0'],
      ['a server that is no MCPServer name', '/usage/tool-latency?server=A_B'],
      ['the retired window parameter', '/usage/tool-latency?window=month'],
    ])('rejects %s', async (_, path) => {
      const response = await request(app).get(path);

      expect(response.status).toBe(400);
      expect(mockGetMcpToolLatency).not.toHaveBeenCalled();
    });
  });

  it('proxies execution detail with steps', async () => {
    const payload = { execution_id: 'abc', steps: [] };
    callTool.mockResolvedValue(payload);

    const response = await request(app).get('/executions/abc');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_execution_get',
      {
        execution_id: 'abc',
        include_steps: true,
      },
      {},
    );
  });

  it('returns 503 when no muster server is configured', async () => {
    const logger = mockServices.logger.mock();
    const config = mockServices.rootConfig({ data: {} });
    const router = await createRouter({
      logger,
      config,
      httpAuth: mockServices.httpAuth(),
      reachability: reachableEverywhere(),
    });
    const unconfiguredApp = expressApp();
    unconfiguredApp.use(router);
    unconfiguredApp.use(MiddlewareFactory.create({ logger, config }).error());

    const health = await request(unconfiguredApp).get('/health');
    expect(health.body).toEqual({ status: 'ok', configured: false });

    const response = await request(unconfiguredApp).get('/workflows');
    expect(response.status).toBe(503);
    expect(response.body.error.name).toBe('ServiceUnavailableError');
  });

  it('lists installations with their reachability', async () => {
    // The fake cache settles on its first tick, so nothing is 'unknown' here.
    await new Promise(resolve => setTimeout(resolve, 0));
    const response = await request(app).get('/installations');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      installations: [
        {
          name: 'muster',
          endpoint: 'injected',
          requiresAuth: false,
          reachable: true,
        },
      ],
    });
  });

  describe('endpoint reachability', () => {
    // The probe is unauthenticated and carries no user data; these tests only
    // check what the route does with its answers. See gs-node's
    // probeEndpoint tests for the classification itself.
    const twoMusters: JsonObject[] = [
      { name: 'gazelle', url: 'https://muster.gazelle.example.io/mcp' },
      {
        name: 'golem',
        url: 'https://muster.golem.example.io/mcp',
        authProvider: 'oidc-golem',
      },
    ];

    function controlledCache() {
      const pending = new Map<string, (result: EndpointProbeResult) => void>();
      const probe = jest.fn(
        (url: string) =>
          new Promise<EndpointProbeResult>(resolve => {
            pending.set(url, resolve);
          }),
      );
      return { cache: new ReachabilityCache({ probe }), probe, pending };
    }

    it('probes the RFC 9728 metadata of every installation once at startup, without a token', async () => {
      const { probe } = controlledCache();

      await buildMultiApp(twoMusters, {
        reachability: new ReachabilityCache({ probe }),
      });

      expect(probe).toHaveBeenCalledTimes(2);
      expect(probe).toHaveBeenCalledWith(
        'https://muster.gazelle.example.io/.well-known/oauth-protected-resource',
      );
      expect(probe).toHaveBeenCalledWith(
        'https://muster.golem.example.io/.well-known/oauth-protected-resource',
      );
      for (const call of probe.mock.calls) {
        expect(call).toHaveLength(1);
      }
    });

    it('defers the warm-up to the startup hook when given the lifecycle', async () => {
      const { probe } = controlledCache();
      const hooks: Array<() => void | Promise<void>> = [];

      await buildMultiApp(twoMusters, {
        reachability: new ReachabilityCache({ probe }),
        lifecycle: {
          addStartupHook: hook => {
            hooks.push(hook);
          },
        },
      });

      // Nothing probed while the other plugins may still be initialising.
      expect(probe).not.toHaveBeenCalled();
      expect(hooks).toHaveLength(1);
      await hooks[0]();
      expect(probe).toHaveBeenCalledTimes(2);
    });

    it("answers 'unknown' while the first probe is in flight, never waiting for it", async () => {
      const { cache, pending } = controlledCache();
      const probing = await buildMultiApp(twoMusters, { reachability: cache });

      const response = await request(probing).get('/installations');

      expect(response.status).toBe(200);
      expect(response.body.installations).toEqual([
        {
          name: 'gazelle',
          endpoint: 'https://muster.gazelle.example.io/mcp',
          requiresAuth: false,
          reachable: 'unknown',
        },
        {
          name: 'golem',
          endpoint: 'https://muster.golem.example.io/mcp',
          requiresAuth: true,
          reachable: 'unknown',
        },
      ]);
      expect(pending.size).toBe(2);
    });

    it('reports an unreachable installation with the probe reason once it settles', async () => {
      const { cache, pending } = controlledCache();
      const probing = await buildMultiApp(twoMusters, { reachability: cache });

      pending.get(
        'https://muster.gazelle.example.io/.well-known/oauth-protected-resource',
      )!({ reachable: true, checkedAt: 1 });
      pending.get(
        'https://muster.golem.example.io/.well-known/oauth-protected-resource',
      )!({
        reachable: false,
        reason: 'no answer within 3000 ms',
        checkedAt: 1,
      });
      await new Promise(resolve => setTimeout(resolve, 0));
      // Unreachable only after a second failed probe in a row.
      void cache.refresh(
        'https://muster.golem.example.io/.well-known/oauth-protected-resource',
      );
      pending.get(
        'https://muster.golem.example.io/.well-known/oauth-protected-resource',
      )!({
        reachable: false,
        reason: 'no answer within 3000 ms',
        checkedAt: 1,
      });
      await new Promise(resolve => setTimeout(resolve, 0));

      const response = await request(probing).get('/installations');

      expect(response.body.installations).toEqual([
        expect.objectContaining({ name: 'gazelle', reachable: true }),
        expect.objectContaining({
          name: 'golem',
          reachable: false,
          reason: 'no answer within 3000 ms',
        }),
      ]);
      expect(response.body.installations[0]).not.toHaveProperty('reason');
    });

    describe('a call to an installation', () => {
      const golemProbe =
        'https://muster.golem.example.io/.well-known/oauth-protected-resource';
      const gazelleProbe =
        'https://muster.gazelle.example.io/.well-known/oauth-protected-resource';
      const token = [
        Buffer.from('{"alg":"none"}').toString('base64url'),
        Buffer.from(
          JSON.stringify({
            sub: 'ada',
            exp: Math.floor(Date.now() / 1000) + 600,
          }),
        ).toString('base64url'),
        'sig',
      ].join('.');

      /** golem probed `times` times with the same answer, once by default. */
      async function settled(
        golem: EndpointProbeResult | undefined,
        times = golem?.reachable === false ? 2 : 1,
      ) {
        const { cache, pending } = controlledCache();
        const probing = await buildMultiApp(twoMusters, {
          reachability: cache,
        });
        pending.get(gazelleProbe)!({ reachable: true, checkedAt: 1 });
        if (golem) {
          for (let probe = 0; probe < times; probe += 1) {
            if (probe > 0) {
              void cache.refresh(golemProbe);
            }
            pending.get(golemProbe)!(golem);
            await new Promise(resolve => setTimeout(resolve, 0));
          }
        }
        await new Promise(resolve => setTimeout(resolve, 0));
        return probing;
      }

      it('one failed probe still lets the call through: a distant muster may have answered late', async () => {
        const probing = await settled(
          {
            reachable: false,
            reason: 'no answer within 5000 ms',
            checkedAt: 1,
          },
          1,
        );
        callTool.mockResolvedValueOnce({ mcpServers: [] });

        const response = await request(probing)
          .get('/servers?installation=golem')
          .set(MUSTER_AUTH_HEADER, token);

        expect(response.status).toBe(200);
        expect(callTool).toHaveBeenCalledTimes(1);
      });

      it('the probe reports unreachable fails at once with the probe reason, without calling muster', async () => {
        const probing = await settled({
          reachable: false,
          reason: 'no answer within 3000 ms',
          checkedAt: 1,
        });

        const response = await request(probing)
          .get('/servers?installation=golem')
          .set(MUSTER_AUTH_HEADER, token);

        expect(response.status).toBe(503);
        expect(response.body.error.message).toBe(
          'golem did not answer: not reachable from this portal (no answer within 3000 ms)',
        );
        expect(callTool).not.toHaveBeenCalled();
      });

      it.each([
        ['while the first probe is in flight', undefined],
        ['the probe reports reachable', { reachable: true, checkedAt: 1 }],
      ])('is made %s', async (_label, golem) => {
        const probing = await settled(golem as EndpointProbeResult | undefined);
        callTool.mockResolvedValueOnce({ mcpServers: [] });

        const response = await request(probing)
          .get('/servers?installation=golem')
          .set(MUSTER_AUTH_HEADER, token);

        expect(response.status).toBe(200);
        expect(callTool).toHaveBeenCalledTimes(1);
      });

      it('the probe reports unreachable still lists it, and its status as unavailable, at once', async () => {
        const probing = await settled({
          reachable: false,
          reason: 'no answer within 3000 ms',
          checkedAt: 1,
        });

        const installations = await request(probing).get('/installations');
        const status = await request(probing)
          .get('/auth/status?installation=golem')
          .set(MUSTER_AUTH_HEADER, token);

        expect(installations.body.installations).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'golem', reachable: false }),
          ]),
        );
        expect(status.status).toBe(200);
        expect(status.body).toEqual({
          servers: [],
          unavailable: true,
          message:
            'golem did not answer: not reachable from this portal (no answer within 3000 ms)',
        });
        expect(getResource).not.toHaveBeenCalled();
      });

      it('probes again at once when a call fails while the probe still says reachable', async () => {
        const { cache, pending, probe } = controlledCache();
        const probing = await buildMultiApp(twoMusters, {
          reachability: cache,
        });
        pending.get(gazelleProbe)!({ reachable: true, checkedAt: Date.now() });
        pending.get(golemProbe)!({ reachable: true, checkedAt: Date.now() });
        await new Promise(resolve => setTimeout(resolve, 0));
        callTool.mockRejectedValueOnce(
          new MusterUnreachableError(
            'golem',
            'the connection failed (ECONNREFUSED)',
          ),
        );

        const response = await request(probing)
          .get('/servers?installation=golem')
          .set(MUSTER_AUTH_HEADER, token);

        expect(response.status).toBe(503);
        expect(probe).toHaveBeenCalledTimes(3);
        expect(probe).toHaveBeenLastCalledWith(golemProbe);
      });

      it('probes again at once when the status read fails while the probe still says reachable', async () => {
        const { cache, pending, probe } = controlledCache();
        const probing = await buildMultiApp(twoMusters, {
          reachability: cache,
        });
        pending.get(gazelleProbe)!({ reachable: true, checkedAt: Date.now() });
        pending.get(golemProbe)!({ reachable: true, checkedAt: Date.now() });
        await new Promise(resolve => setTimeout(resolve, 0));
        getResource.mockRejectedValueOnce(
          new MusterUnreachableError(
            'golem',
            'the connection failed (ECONNREFUSED)',
          ),
        );

        const response = await request(probing)
          .get('/auth/status?installation=golem')
          .set(MUSTER_AUTH_HEADER, token);

        expect(response.status).toBe(200);
        expect(response.body.unavailable).toBe(true);
        expect(probe).toHaveBeenCalledTimes(3);
        expect(probe).toHaveBeenLastCalledWith(golemProbe);
      });

      it('does not probe again for its own refusal', async () => {
        const { cache, pending, probe } = controlledCache();
        const probing = await buildMultiApp(twoMusters, {
          reachability: cache,
        });
        pending.get(gazelleProbe)!({ reachable: true, checkedAt: 1 });
        const unreachable = {
          reachable: false,
          reason: 'no answer within 5000 ms',
          checkedAt: Date.now(),
        };
        pending.get(golemProbe)!(unreachable);
        await new Promise(resolve => setTimeout(resolve, 0));
        void cache.refresh(golemProbe);
        pending.get(golemProbe)!(unreachable);
        await new Promise(resolve => setTimeout(resolve, 0));

        const response = await request(probing)
          .get('/servers?installation=golem')
          .set(MUSTER_AUTH_HEADER, token);

        expect(response.status).toBe(503);
        expect(probe).toHaveBeenCalledTimes(3);
      });

      it('logs nothing for the refused call: the probe logged the state change', async () => {
        const logger = mockServices.logger.mock();
        const { cache, pending } = controlledCache();
        const router = await createRouter({
          logger,
          config: mockServices.rootConfig({
            data: { muster: { installations: twoMusters } },
          }),
          client: mockClient,
          reachability: cache,
          httpAuth: mockServices.httpAuth(),
        });
        const probing = expressApp();
        probing.use(router);
        probing.use(
          MiddlewareFactory.create({
            logger,
            config: mockServices.rootConfig(),
          }).error(),
        );
        for (let probe = 0; probe < 2; probe += 1) {
          if (probe > 0) {
            void cache.refresh(golemProbe);
          }
          pending.get(golemProbe)!({
            reachable: false,
            reason: 'no answer within 5000 ms',
            checkedAt: 1,
          });
          await new Promise(resolve => setTimeout(resolve, 0));
        }

        const response = await request(probing)
          .get('/servers?installation=golem')
          .set(MUSTER_AUTH_HEADER, token);

        expect(response.status).toBe(503);
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      });
    });

    it('derives the probe URL next to the /mcp endpoint', () => {
      expect(musterProbeUrl('https://muster.golem.example.io/mcp')).toBe(
        'https://muster.golem.example.io/.well-known/oauth-protected-resource',
      );
      expect(musterProbeUrl('https://muster.golem.example.io/mcp/')).toBe(
        'https://muster.golem.example.io/.well-known/oauth-protected-resource',
      );
      // A URL without the /mcp suffix (a local aggregator) is probed at its root.
      expect(musterProbeUrl('http://muster:8090')).toBe(
        'http://muster:8090/.well-known/oauth-protected-resource',
      );
      expect(musterProbeUrl('http://localhost:8090/mcp')).toBe(
        'http://localhost:8090/.well-known/oauth-protected-resource',
      );
    });
  });

  describe('installations derived from the fleet configuration', () => {
    // gazelle and golem have a base domain, so each gets a derived muster
    // endpoint; gazelle's is then overridden by an explicit entry. snail has
    // no base domain and is not a muster installation the proxy can reach.
    const FLEET: JsonObject = {
      gs: {
        installations: {
          gazelle: { baseDomain: 'gazelle.example.test' },
          golem: { baseDomain: 'golem.example.test' },
          snail: { pipeline: 'testing' },
        },
      },
    };

    async function buildFleetApp(data: JsonObject) {
      const logger = mockServices.logger.mock();
      const config = mockServices.rootConfig({ data });
      const router = await createRouter({
        logger,
        config,
        httpAuth: mockServices.httpAuth(),
        client: mockClient,
        reachability: reachableEverywhere(),
      });
      const fleetApp = expressApp();
      fleetApp.use(router);
      fleetApp.use(MiddlewareFactory.create({ logger, config }).error());
      return { fleetApp, logger };
    }

    it('lists derived and configured installations with their endpoints', async () => {
      const { fleetApp } = await buildFleetApp({
        ...FLEET,
        muster: {
          installations: [
            {
              name: 'gazelle',
              url: 'https://muster-internal.gazelle.example.test/mcp',
              authProvider: 'mcp-muster',
            },
          ],
        },
      });

      const response = await request(fleetApp).get('/installations');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        installations: [
          {
            name: 'gazelle',
            endpoint: 'https://muster-internal.gazelle.example.test/mcp',
            requiresAuth: true,
            reachable: true,
          },
          {
            name: 'golem',
            endpoint: 'https://muster.golem.example.test/mcp',
            requiresAuth: true,
            reachable: true,
          },
        ],
      });
    });

    it('logs the counts once at start', async () => {
      const { logger } = await buildFleetApp({
        ...FLEET,
        muster: {
          installations: [
            { name: 'gazelle', url: 'https://muster.gazelle.example.test/mcp' },
            { name: 'lab', url: 'https://muster.lab.example.test/mcp' },
          ],
        },
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Muster proxy installations: 1 derived from gs.installations base domains, 2 configured in muster.installations, 3 total.',
      );
    });

    it("requires the person's token for a derived installation", async () => {
      const { fleetApp } = await buildFleetApp(FLEET);
      listTools.mockResolvedValue({ tools: [], servers_requiring_auth: [] });

      const without = await request(fleetApp).get('/tools?installation=golem');
      expect(without.status).toBe(401);
      expect(without.body.error.message).toContain(
        "installation 'golem' requires a user token",
      );
      expect(listTools).not.toHaveBeenCalled();

      const withToken = await request(fleetApp)
        .get('/tools?installation=golem')
        .set(MUSTER_AUTH_HEADER, 'user-token');
      expect(withToken.status).toBe(200);
      expect(listTools).toHaveBeenCalledWith({ authToken: 'user-token' });
    });

    it('does not target an installation without a base domain', async () => {
      const { fleetApp } = await buildFleetApp(FLEET);

      const response = await request(fleetApp).get('/tools?installation=snail');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain(
        "Unknown muster installation 'snail'",
      );
    });
  });

  it('lists tools via the list_tools meta-tool', async () => {
    listTools.mockResolvedValue({ tools: [], servers_requiring_auth: [] });

    const response = await request(app).get('/tools');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tools: [], servers_requiring_auth: [] });
    expect(listTools).toHaveBeenCalledWith({});
  });

  it('filters tools with query params', async () => {
    filterTools.mockResolvedValue({ tools: [] });

    const response = await request(app).get(
      '/tools/filter?pattern=x_*&query=pods&limit=10&include_schema=true',
    );

    expect(response.status).toBe(200);
    expect(filterTools).toHaveBeenCalledWith(
      { pattern: 'x_*', query: 'pods', limit: 10, include_schema: true },
      {},
    );
  });

  it('passes a repeated toolset= parameter through as a selector list, in order', async () => {
    filterTools.mockResolvedValue({
      tools: [],
      toolset: ['preset:read-only', 'workflow:incident-triage'],
      toolset_unmatched: ['workflow:incident-triage'],
      presets: [{ name: 'read-only', built_in: true }],
    });

    const response = await request(app).get(
      '/tools/filter?toolset=preset:read-only&toolset=workflow:incident-triage&include_presets=true&limit=1000',
    );

    expect(response.status).toBe(200);
    expect(filterTools).toHaveBeenCalledWith(
      {
        toolset: ['preset:read-only', 'workflow:incident-triage'],
        include_presets: true,
        limit: 1000,
      },
      {},
    );
    // muster's toolset fields travel back untouched.
    expect(response.body.toolset_unmatched).toEqual([
      'workflow:incident-triage',
    ]);
    expect(response.body.presets).toEqual([
      { name: 'read-only', built_in: true },
    ]);
  });

  it('accepts a single toolset= parameter as a one-selector list', async () => {
    filterTools.mockResolvedValue({ tools: [], toolset: ['preset:none'] });

    const response = await request(app).get(
      '/tools/filter?toolset=preset:none',
    );

    expect(response.status).toBe(200);
    expect(filterTools).toHaveBeenCalledWith({ toolset: ['preset:none'] }, {});
  });

  it('passes more than 20 toolset= parameters through as a selector list, in order', async () => {
    filterTools.mockResolvedValue({ tools: [] });
    const selectors = Array.from({ length: 25 }, (_, i) => `tool:x_tool_${i}`);

    const response = await request(app).get(
      `/tools/filter?${selectors.map(s => `toolset=${s}`).join('&')}`,
    );

    expect(response.status).toBe(200);
    expect(filterTools).toHaveBeenCalledWith({ toolset: selectors }, {});
  });

  it('passes more selectors than qs keeps parameters (1000) through whole', async () => {
    filterTools.mockResolvedValue({ tools: [] });
    // Short selectors keep the URL under Node's 16 KiB header limit.
    const selectors = Array.from({ length: 1005 }, (_, i) => `t${i}`);

    const response = await request(app).get(
      `/tools/filter?${selectors.map(s => `toolset=${s}`).join('&')}`,
    );

    expect(response.status).toBe(200);
    expect(filterTools).toHaveBeenCalledWith({ toolset: selectors }, {});
  });

  it.each([
    ['toolset[x]=preset:full'],
    ['toolset[25]=preset:full'],
    ['toolset[0]=preset:full&toolset[100]=preset:none'],
  ])('ignores bracket syntax as a toolset (%s)', async query => {
    filterTools.mockResolvedValue({ tools: [] });

    const response = await request(app).get(`/tools/filter?${query}`);

    expect(response.status).toBe(200);
    expect(filterTools).toHaveBeenCalledWith({}, {});
  });

  it('forwards only the plain toolset= values when bracket syntax is mixed in', async () => {
    filterTools.mockResolvedValue({ tools: [] });
    const selectors = Array.from({ length: 25 }, (_, i) => `tool:x_tool_${i}`);

    const response = await request(app).get(
      `/tools/filter?${selectors
        .map(s => `toolset=${s}`)
        .join('&')}&toolset[x]=preset:full&toolset[3]=preset:full`,
    );

    expect(response.status).toBe(200);
    expect(filterTools).toHaveBeenCalledWith({ toolset: selectors }, {});
  });

  it("surfaces muster's unknown-preset refusal as the request error", async () => {
    // gs-node's client turns an `isError` meta-tool result into a thrown Error
    // carrying muster's text; the frontend shows that text verbatim.
    filterTools.mockRejectedValue(
      new Error(
        'toolset [preset:foo] names unknown preset "foo"; known presets: read-only, none, full',
      ),
    );

    const response = await request(app).get('/tools/filter?toolset=preset:foo');

    expect(response.status).toBe(500);
    expect(response.body.error.message).toContain('unknown preset "foo"');
  });

  it('filters resources by server and pattern', async () => {
    filterResources.mockResolvedValue({ resources: [] });

    const response = await request(app).get(
      '/resources/filter?server=pro&pattern=board://*&limit=10&offset=5',
    );

    expect(response.status).toBe(200);
    expect(filterResources).toHaveBeenCalledWith(
      { server: 'pro', pattern: 'board://*', limit: 10, offset: 5 },
      {},
    );
  });

  it('filters resources without any scope', async () => {
    filterResources.mockResolvedValue({ resources: [] });

    const response = await request(app).get('/resources/filter');

    expect(response.status).toBe(200);
    expect(filterResources).toHaveBeenCalledWith({}, {});
  });

  it('filters prompts by server', async () => {
    filterPrompts.mockResolvedValue({ prompts: [] });

    const response = await request(app).get('/prompts/filter?server=pro');

    expect(response.status).toBe(200);
    expect(filterPrompts).toHaveBeenCalledWith({ server: 'pro' }, {});
  });

  it('describes a tool by name', async () => {
    describeTool.mockResolvedValue({ name: 'x_kubernetes_get' });

    const response = await request(app).get('/tools/x_kubernetes_get');

    expect(response.status).toBe(200);
    expect(describeTool).toHaveBeenCalledWith('x_kubernetes_get', {});
  });

  it('lists core tools', async () => {
    listCoreTools.mockResolvedValue({ tools: [] });

    const response = await request(app).get('/core-tools?include_schema=false');

    expect(response.status).toBe(200);
    expect(listCoreTools).toHaveBeenCalledWith({ include_schema: false }, {});
  });

  it('lists mcp servers via core_mcpserver_list, keeping failed servers and their errors', async () => {
    callTool.mockResolvedValue({ mcpServers: [] });

    const response = await request(app).get('/servers');

    expect(response.status).toBe(200);
    // showAll: muster hides Failed servers by default, but the UIs (server
    // detail, wizard verify panel) exist to show exactly those. verbose keeps
    // the raw error alongside statusMessage.
    expect(callTool).toHaveBeenCalledWith(
      'core_mcpserver_list',
      { showAll: true, verbose: true },
      {},
    );
  });

  describe('GET /server-info', () => {
    const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
    const TOKEN = 'user-token';

    async function readInfo() {
      const authApp = await buildMultiApp([
        { name: 'gazelle', url: 'https://muster.gazelle', authProvider: 'dex' },
      ]);
      return request(authApp)
        .get('/server-info?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, TOKEN);
    }

    it("answers the icon from muster's initialize result, as the person", async () => {
      serverIcon.mockResolvedValue(SVG);

      const response = await readInfo();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ icon: SVG });
      expect(serverIcon).toHaveBeenCalledWith({ authToken: TOKEN });
    });

    it('answers no icon for a muster that announces none', async () => {
      serverIcon.mockResolvedValue(undefined);

      const response = await readInfo();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({});
    });

    it('answers unavailable, not a 5xx, when muster cannot be asked', async () => {
      serverIcon.mockRejectedValue(new Error('fetch failed'));

      const response = await readInfo();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ unavailable: true });
    });

    // The token refresh only follows a 401: a refused bearer must not read
    // as "no icon" until the frontend's next read.
    it('answers 401 when muster refuses the forwarded token', async () => {
      serverIcon.mockRejectedValue(
        Object.assign(
          new Error(
            'MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): invalid_token',
          ),
          { name: 'MCPClientError', statusCode: 401 },
        ),
      );

      const response = await readInfo();

      expect(response.status).toBe(401);
      expect(response.body.error.reason).toBe('token_rejected');
    });

    it('asks for the token muster needs before connecting', async () => {
      const authApp = await buildMultiApp([
        { name: 'gazelle', url: 'https://muster.gazelle', authProvider: 'dex' },
      ]);

      const response = await request(authApp).get(
        '/server-info?installation=gazelle',
      );

      expect(response.status).toBe(401);
      expect(serverIcon).not.toHaveBeenCalled();
    });
  });

  /**
   * These routes are only active on an installation that forwards a per-user
   * token, so the whole block runs against one and sends the header.
   */
  describe('downstream server auth', () => {
    const TOKEN = 'user-token';
    let authApp: express.Express;

    beforeEach(async () => {
      authApp = await buildMultiApp([
        { name: 'gazelle', url: 'https://muster.gazelle', authProvider: 'dex' },
      ]);
    });

    const login = (body: JsonObject) =>
      request(authApp)
        .post('/auth/login?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, TOKEN)
        .send(body);

    const readStatus = () =>
      request(authApp)
        .get('/auth/status?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, TOKEN);

    it('reads per-server auth status from the auth://status resource', async () => {
      const payload = {
        servers: [{ name: 'pro', status: 'auth_required' }],
      };
      getResource.mockResolvedValue(payload);

      const response = await readStatus();

      expect(response.status).toBe(200);
      expect(response.body).toEqual(payload);
      expect(getResource).toHaveBeenCalledWith('auth://status', {
        authToken: TOKEN,
      });
    });

    /**
     * A muster that doesn't register auth://status is an expected outcome, and
     * the frontend polls this route every few seconds while a sign-in is
     * outstanding -- a >=500 here would be a Sentry stream.
     */
    it('answers an unavailable status resource with an empty list, not a 5xx', async () => {
      getResource.mockRejectedValue(
        new Error('Muster resource auth://status returned no text content'),
      );

      const response = await readStatus();

      expect(response.status).toBe(200);
      // Flagged, not just empty: a waiting row has to be able to tell "nothing
      // needs a sign-in" from "we cannot tell".
      expect(response.body).toEqual({
        servers: [],
        unavailable: true,
        message: 'Muster resource auth://status returned no text content',
      });
    });

    it('returns the sign-in URL from the challenge structuredContent', async () => {
      callToolWithStructured.mockResolvedValue({
        text: 'Authentication Required\n\nServer: pro',
        structuredContent: {
          authUrl:
            'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
        },
      });

      const response = await login({ server: 'pro' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'auth_required',
        authUrl:
          'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
      });
      expect(callToolWithStructured).toHaveBeenCalledWith(
        'core_auth_login',
        { server: 'pro' },
        { authToken: TOKEN },
      );
    });

    it('reports an already-connected server as connected', async () => {
      callToolWithStructured.mockResolvedValue({
        text: "Server 'pro' is already authenticated and connected.",
      });

      const response = await login({ server: 'pro' });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('connected');
    });

    /**
     * Muster refuses a manual login for SSO-managed servers, rate limits, and
     * missing OAuth config as MCP tool errors. Those are expected outcomes of
     * this route, so they must not surface as 5xx (MiddlewareFactory logs those
     * to Sentry regardless of our own log level).
     */
    it('returns a tool-level refusal as a structured 200', async () => {
      callToolWithStructured.mockRejectedValue(
        new Error("Server 'pro' uses SSO and is connected automatically."),
      );

      const response = await login({ server: 'pro' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'error',
        message: "Server 'pro' uses SSO and is connected automatically.",
      });
    });

    /**
     * The flip side: an outage must NOT be dressed up as muster declining, or
     * the user reads "fetch failed" as a policy decision and Sentry sees
     * nothing.
     */
    it.each([
      ['a transport failure', new TypeError('fetch failed')],
      [
        'a closed client',
        new Error('Attempted to send a request from a closed client'),
      ],
      [
        'an unavailable dependency',
        Object.assign(new Error('no executor'), {
          name: 'ServiceUnavailableError',
        }),
      ],
      // Every non-2xx from muster's endpoint arrives this way, including a 401
      // from its own OAuth proxy.
      [
        'a non-2xx from muster',
        Object.assign(new Error('MCP HTTP Transport Error: (HTTP 502)'), {
          name: 'MCPClientError',
          statusCode: 502,
        }),
      ],
    ])('lets %s keep its 5xx', async (_label, thrown) => {
      callToolWithStructured.mockRejectedValue(thrown);

      const response = await login({ server: 'pro' });

      expect(response.status).toBeGreaterThanOrEqual(500);
    });

    it('requires a server name', async () => {
      const response = await login({});

      expect(response.status).toBe(400);
      expect(callToolWithStructured).not.toHaveBeenCalled();
    });

    it("starts the grant of a provider App with muster's app argument", async () => {
      callToolWithStructured.mockResolvedValue({
        text: "Authentication required for 'github'.",
        structuredContent: {
          app: 'github',
          authUrl:
            'https://muster.gazelle.example.io/oauth/proxy/start?state=app',
        },
      });

      const response = await login({ app: 'github' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'auth_required',
        authUrl:
          'https://muster.gazelle.example.io/oauth/proxy/start?state=app',
      });
      expect(callToolWithStructured).toHaveBeenCalledWith(
        'core_auth_login',
        { app: 'github' },
        { authToken: TOKEN },
      );
    });

    it('refuses a body naming both a server and an app', async () => {
      const response = await login({ server: 'pro', app: 'github' });

      expect(response.status).toBe(400);
      expect(callToolWithStructured).not.toHaveBeenCalled();
    });

    it('fails with 401 when the user token is missing', async () => {
      const response = await request(authApp)
        .post('/auth/login?installation=gazelle')
        .send({ server: 'pro' });

      expect(response.status).toBe(401);
      expect(callToolWithStructured).not.toHaveBeenCalled();
    });

    // The inverse flow, same error contract as /auth/login.
    describe('/auth/logout', () => {
      const logout = (body: JsonObject) =>
        request(authApp)
          .post('/auth/logout?installation=gazelle')
          .set(MUSTER_AUTH_HEADER, TOKEN)
          .send(body);

      it('reports a completed logout as signed_out', async () => {
        // Verbatim from muster's handleAuthLogout.
        const message = [
          "Successfully logged out from 'pro'.",
          '',
          "The server's tools are now hidden. Use core_auth_login with server='pro' to re-authenticate.",
        ].join('\n');
        callToolWithStructured.mockResolvedValue({ text: message });

        const response = await logout({ server: 'pro' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'signed_out', message });
        expect(callToolWithStructured).toHaveBeenCalledWith(
          'core_auth_logout',
          { server: 'pro' },
          { authToken: TOKEN },
        );
      });

      /**
       * Muster refuses a logout for unknown servers and SSO-managed servers as
       * MCP tool errors. Expected outcomes of this route, so structured 200s
       * rather than Sentry-bound 5xxs -- same contract as /auth/login.
       */
      it.each([
        "Server 'pro' not found.",
        "Server 'pro' uses SSO and is managed automatically.",
      ])('returns the tool-level refusal %j as a structured 200', async msg => {
        callToolWithStructured.mockRejectedValue(new Error(msg));

        const response = await logout({ server: 'pro' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'error', message: msg });
      });

      it('lets an infrastructure fault keep its 5xx', async () => {
        callToolWithStructured.mockRejectedValue(new TypeError('fetch failed'));

        const response = await logout({ server: 'pro' });

        expect(response.status).toBeGreaterThanOrEqual(500);
      });

      it('requires a server name', async () => {
        const response = await logout({});

        expect(response.status).toBe(400);
        expect(callToolWithStructured).not.toHaveBeenCalled();
      });

      it('fails with 401 when the user token is missing', async () => {
        const response = await request(authApp)
          .post('/auth/logout?installation=gazelle')
          .send({ server: 'pro' });

        expect(response.status).toBe(401);
        expect(callToolWithStructured).not.toHaveBeenCalled();
      });

      it('refuses on an installation without per-user auth', async () => {
        const response = await request(app)
          .post('/auth/logout')
          .send({ server: 'pro' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('error');
        expect(response.body.message).toContain('without an authProvider');
        expect(callToolWithStructured).not.toHaveBeenCalled();
      });
    });

    /**
     * Without an authProvider there is no per-user token to key the MCP session
     * cache on, so every portal user shares one muster session -- and one user's
     * completed login would hand the next user their downstream grant.
     */
    describe('installation without per-user auth', () => {
      it('reports no auth-gated servers', async () => {
        const response = await request(app).get('/auth/status');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ servers: [] });
        expect(getResource).not.toHaveBeenCalled();
      });

      it('refuses to start a sign-in', async () => {
        const response = await request(app)
          .post('/auth/login')
          .send({ server: 'pro' });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('error');
        expect(response.body.message).toContain('without an authProvider');
        expect(callToolWithStructured).not.toHaveBeenCalled();
      });
    });
  });

  // An installation that forwards the person's token: every tool runs as them.
  const personApp = () =>
    buildMultiApp([
      { name: 'gazelle', url: 'http://g/mcp', authProvider: 'dex' },
    ]);
  const asPerson = { authToken: 'user-token' };

  describe('/servers/names', () => {
    it("answers each connector's name, family and display name, as the person", async () => {
      callTool.mockResolvedValue({
        mcpServers: [
          {
            name: 'agent-manager',
            displayName: ' Agent Manager ',
            url: 'https://example.com/mcp',
            statusMessage: 'Connected',
          },
          {
            name: 'gazelle-mcp-kubernetes',
            family: { name: 'kubernetes', instanceArg: 'management_cluster' },
          },
          {
            name: 'search',
            namespace: 'org-acme',
            key: 'org-acme/search',
            displayName: 'Acme Search',
          },
          { name: 'blank', displayName: '  ' },
          { displayName: 'Nameless' },
        ],
      });
      const response = await request(await personApp())
        .get('/servers/names?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        servers: [
          { name: 'agent-manager', displayName: 'Agent Manager' },
          { name: 'gazelle-mcp-kubernetes', family: 'kubernetes' },
          // A tenant's server by muster's key, as auth://status names it.
          { name: 'org-acme/search', displayName: 'Acme Search' },
          { name: 'blank' },
        ],
      });
      expect(callTool).toHaveBeenCalledWith(
        'core_mcpserver_list',
        { showAll: true },
        { authToken: 'user-token' },
      );
    });

    // A background reader names the connectors: a failure is no Sentry
    // issue, and the prompts keep the servers' own names.
    it('answers a refused list as unavailable, not a 5xx', async () => {
      callTool.mockRejectedValue(new Error('Failed to list MCP servers'));

      const response = await request(app).get('/servers/names');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ servers: [], unavailable: true });
    });

    // Read once per installation, not polled: an outage is reported, as on
    // `/auth/login`, not hidden behind an empty answer.
    it('answers muster being unreachable with a 5xx', async () => {
      callTool.mockRejectedValue(new TypeError('fetch failed'));

      const response = await request(app).get('/servers/names');

      expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // The token refresh only follows a 401: muster refusing the bearer
    // must not read as "cannot name them" for the rest of the tab.
    it('answers 401 when muster refuses the forwarded token', async () => {
      callTool.mockRejectedValue(
        new MusterToolError('Your token has expired. Please re-authenticate.'),
      );

      const response = await request(await personApp())
        .get('/servers/names?installation=gazelle')
        .set(MUSTER_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(401);
    });

    it('refuses a read without the person token with a 401', async () => {
      const response = await request(await personApp()).get(
        '/servers/names?installation=gazelle',
      );

      expect(response.status).toBe(401);
      expect(callTool).not.toHaveBeenCalled();
    });
  });

  describe('/call', () => {
    it('executes a core tool on an installation without per-user auth', async () => {
      callTool.mockResolvedValue({ ok: true });

      const response = await request(app)
        .post('/call')
        .send({ name: 'core_service_list', arguments: {} });

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith(
        'core_service_list',
        {},
        {
          urlElicitation: true,
          signal: expect.any(AbortSignal),
        },
      );
    });

    it('executes a mutating-looking core tool without any gate', async () => {
      callTool.mockResolvedValue({ ok: true });

      const response = await request(app)
        .post('/call')
        .send({ name: 'core_service_stop', arguments: { name: 'k8s' } });

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith(
        'core_service_stop',
        { name: 'k8s' },
        { urlElicitation: true, signal: expect.any(AbortSignal) },
      );
    });

    it('requires a name', async () => {
      const response = await request(app).post('/call').send({ arguments: {} });

      expect(response.status).toBe(400);
      expect(callTool).not.toHaveBeenCalled();
    });

    /**
     * Without an authProvider muster would run the call under its own
     * identity, shared by every portal user. Only muster's core tools run
     * there: an aggregated server's tool under any name, a workflow whose
     * steps call one, a meta-tool wrapping another call and per-user auth
     * are refused before muster is called.
     */
    it.each([
      'x_agent-manager_start_session',
      'x_agent-manager_create_agent',
      'x_agent-manager_update_agent',
      'x_agent-manager_delete_agent',
      'x_model-manager_load_model',
      'x_cluster-manager_delete_node_pool',
      'x_agents_create_agent',
      'workflow_start-agent-session',
      'call_tool',
      'core_auth_login',
    ])('refuses %s on an installation without per-user auth', async name => {
      const response = await request(app)
        .post('/call')
        .send({
          name,
          arguments: {
            name: 'x_agent-manager_delete_agent',
            arguments: {},
          },
        });

      expect(response.status).toBe(403);
      expect(response.body.error.message).toContain('without an authProvider');
      expect(response.body.error.message).toContain(name);
      expect(callTool).not.toHaveBeenCalled();
    });

    it("runs an aggregated server's tool with the person's token", async () => {
      callTool.mockResolvedValue({ session: { id: 's-1' } });

      const response = await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({ name: 'x_agent-manager_start_session', arguments: {} });

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith(
        'x_agent-manager_start_session',
        {},
        {
          ...asPerson,
          urlElicitation: true,
          signal: expect.any(AbortSignal),
        },
      );
    });

    it('cancels the muster call when the page goes away', async () => {
      let signal: AbortSignal | undefined;
      callTool.mockImplementation(
        (_name: string, _args: unknown, options: { signal?: AbortSignal }) =>
          new Promise(resolve => {
            signal = options.signal;
            signal?.addEventListener('abort', () => resolve({}));
          }),
      );

      await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({ name: 'x_github_get_me', arguments: {} })
        .timeout(200)
        .catch(() => undefined);

      for (let i = 0; i < 50 && !signal?.aborted; i++) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(signal?.aborted).toBe(true);
    });

    it("passes the person's answer to muster's URL elicitation on", async () => {
      callTool.mockResolvedValue({ ok: true });
      const input = {
        inputResponses: { muster_sign_in: { action: 'decline' } },
        requestState: '{"server":"github"}',
      };

      const response = await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({ name: 'x_github_get_me', arguments: {}, input });

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith(
        'x_github_get_me',
        {},
        {
          ...asPerson,
          urlElicitation: true,
          input,
          signal: expect.any(AbortSignal),
        },
      );
    });

    it('declares no URL elicitation for a page that opens the page itself', async () => {
      callTool.mockResolvedValue({ credentialOperation: 'op' });

      const response = await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({
          name: 'x_agent-manager_set_organization_model',
          arguments: { name: 'claude' },
          urlElicitation: false,
        });

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith(
        'x_agent-manager_set_organization_model',
        { name: 'claude' },
        { ...asPerson, signal: expect.any(AbortSignal) },
      );
    });

    it.each([
      [
        'an answer to an elicitation it does not declare',
        {
          urlElicitation: false,
          input: { inputResponses: { muster_sign_in: { action: 'accept' } } },
        },
      ],
      ['a urlElicitation that is not a boolean', { urlElicitation: 'no' }],
    ])('refuses %s', async (_case, body) => {
      const response = await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({ name: 'x_github_get_me', arguments: {}, ...body });

      expect(response.status).toBe(400);
      expect(callTool).not.toHaveBeenCalled();
    });

    it('refuses an answer that is not one', async () => {
      const response = await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({
          name: 'x_github_get_me',
          input: { inputResponses: { muster_sign_in: { action: 'yes' } } },
        });

      expect(response.status).toBe(400);
      expect(callTool).not.toHaveBeenCalled();
    });

    it("answers muster's input_required with 428, its elicitations and requestState", async () => {
      const elicitations = [
        {
          key: 'muster_sign_in',
          url: 'https://muster/oauth/proxy/start?state=abc',
          message: 'Sign in to github to continue.',
        },
      ];
      callTool.mockRejectedValue(
        new MusterInputRequiredError(elicitations, 'opaque', {
          tool: 'x_github_get_me',
          installation: 'gazelle',
        }),
      );

      const response = await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({ name: 'x_github_get_me', arguments: {} });

      expect(response.status).toBe(428);
      expect(response.body.error).toMatchObject({
        name: 'MusterInputRequiredError',
        message: 'Sign in to github to continue.',
        elicitations,
        requestState: 'opaque',
      });
    });

    // cluster-manager's delete_node_pool answers its structured refusal as a
    // second text block; gs-node keeps it as the error's `details`, and the
    // error middleware serializes it next to the message for the frontend.
    it('answers a refused tool with its message and further text blocks', async () => {
      callTool.mockRejectedValue(
        new MusterToolError('node pool gpu-l4 still runs 1 node(s)', [
          '{"refused":{"nodes":["i-0abc"],"models":[],"hint":"wait"}}',
        ]),
      );

      const response = await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({ name: 'x_cluster-manager_delete_node_pool', arguments: {} });

      expect(response.status).toBe(500);
      expect(response.body.error).toMatchObject({
        name: 'MusterToolError',
        message: 'node pool gpu-l4 still runs 1 node(s)',
        details: ['{"refused":{"nodes":["i-0abc"],"models":[],"hint":"wait"}}'],
      });
    });
  });

  describe("/call of muster's connector tools", () => {
    const SECRET = 'hubspot-s3cret';
    // The client names the called tool on its error, as MusterMcpClient does,
    // which gives a connector write's refusal its 422.
    const toolError = (
      message: string,
      details: string[] = [],
      tool = 'core_mcpserver_create',
    ) =>
      new MusterToolError(message, details, { tool, installation: 'gazelle' });
    const rejectWith = (message: string, details: string[] = []) =>
      callTool.mockImplementation(async (tool: string) => {
        throw toolError(message, details, tool);
      });
    const refusal =
      'Permission denied: your user may not create Secret jira-oauth-client-ab12c in namespace muster. Ask a platform admin to grant you the mcpserver-editor role.';
    const create = async () =>
      request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({
          name: 'core_mcpserver_create',
          arguments: {
            name: 'jira',
            clientCredentials: {
              clientId: 'hubspot-client',
              clientSecret: SECRET,
            },
          },
        });

    // A refusal is the person's answer, not the portal's fault: below the
    // 500 at which the error middleware logs to Sentry.
    it("answers muster's refusal as a 422 with its message, never the arguments", async () => {
      rejectWith(refusal, ['{"missing":"create secrets"}']);

      const response = await create();

      expect(response.status).toBe(422);
      expect(response.body.error).toMatchObject({
        name: 'MusterToolError',
        message: refusal,
        details: ['{"missing":"create secrets"}'],
      });
      expect(JSON.stringify(response.body)).not.toContain(SECRET);
    });

    // MiddlewareFactory.error() logs at error level, which the root logger
    // ships to Sentry, only from 500 on: a refusal stays out, an outage not.
    it.each([
      [toolError(refusal), 422, false],
      [
        toolError(
          'forbidden: you may not update agents',
          [],
          'x_agent-manager_update_agent',
        ),
        403,
        false,
      ],
      // The client logs a rollout's interruption at info and marks it.
      [markReported(toolError('interrupted: muster is rolling')), 503, false],
      [
        toolError(
          "Tool execution failed: no answer within the server's timeout of 30s",
        ),
        504,
        true,
      ],
      [new Error('fetch failed'), 500, true],
    ])(
      'logs %s at error level only for a 5xx not already logged',
      async (error, status, loggedAsError) => {
        const logger = mockServices.logger.mock();
        jest.mocked(logger.child).mockReturnValue(logger);
        const config = mockServices.rootConfig({
          data: {
            muster: {
              installations: [
                { name: 'gazelle', url: 'http://g/mcp', authProvider: 'dex' },
              ],
            },
          },
        });
        const router = await createRouter({
          logger,
          config,
          httpAuth: mockServices.httpAuth(),
          client: mockClient,
          reachability: reachableEverywhere(),
        });
        const loggedApp = expressApp();
        loggedApp.use(router);
        loggedApp.use(MiddlewareFactory.create({ logger, config }).error());
        callTool.mockRejectedValue(error);

        const response = await request(loggedApp)
          .post('/call')
          .set(MUSTER_AUTH_HEADER, 'user-token')
          .send({
            name: 'core_mcpserver_create',
            arguments: { clientCredentials: { clientSecret: SECRET } },
          });

        expect(response.status).toBe(status);
        expect(jest.mocked(logger.error).mock.calls.length > 0).toBe(
          loggedAsError,
        );
        expect(
          JSON.stringify(jest.mocked(logger.error).mock.calls),
        ).not.toContain(SECRET);
      },
    );

    it('keeps the sign-in muster asks for a 401', async () => {
      callTool.mockRejectedValue(
        new MusterAuthRequiredError('jira', 'https://idp/authorize', [
          "auth_required: server 'jira' requires authentication",
        ]),
      );

      const response = await create();

      expect(response.status).toBe(401);
      expect(response.body.error.reason).toBe('server_sign_in_required');
    });

    it("keeps muster's expired-token answer a 401", async () => {
      callTool.mockRejectedValue(
        new MusterToolError(
          'token has expired for muster, re-authenticate to refresh: token is expired',
        ),
      );

      const response = await create();

      expect(response.status).toBe(401);
      expect(response.body.error.reason).toBe('token_expired');
    });

    // muster's refusals, as its connector write tools word them.
    it.each([
      'Permission denied: your user may not create MCPServer "jira" (mcpservers) in namespace "muster". Ask a platform admin to grant you the mcpserver-editor role. API server response: forbidden',
      'Invalid MCP server definition: url is required',
      'Validation failed: auth.authorizationServer needs an issuer',
      "MCP server 'jira' already exists",
      "Cannot create MCP server 'jira': server 'hubspot' pins issuer https://app.hubspot.com with another client. One issuer, one client: use an existing Secret with that server's client, or another issuer",
      "Cannot update MCP server 'jira': its stored client belongs to the previous issuer and endpoints of auth.authorizationServer; re-enter it with clientCredentials",
      'Cannot store the client credentials of MCP server \'jira\', so it was not created: Permission denied: your user may not create Secret "jira-oauth-client-ab12c" (secrets) in namespace "muster".',
      'Cannot store the client credentials of MCP server \'jira\', so it was not created: Secret "jira-oauth-client-ab12c" already exists in namespace "muster"; retry to generate another name',
      "Failed to create MCP server: mcpservers.muster.giantswarm.io \"jira\" is forbidden: ValidatingAdmissionPolicy 'muster-mcpserver-secret-references' with binding 'muster-mcpserver-secret-references' denied request: the writer of an MCPServer may name only Secrets they may get",
    ])('answers the refusal %j as a 422', async message => {
      rejectWith(message);

      const response = await create();

      expect(response.status).toBe(422);
      expect(response.body.error.message).toBe(message);
    });

    // muster's own failures are tool errors too: they stay 500 and reach
    // Sentry rather than read as the person's mistake.
    it.each([
      'Failed to create MCP server: etcdserver: request timed out',
      'Failed to update MCP server: Internal error occurred: failed calling webhook "mcpservers.muster.giantswarm.io": connection refused',
      'Failed to get existing MCP server: the server is currently unable to handle the request',
      'Cannot store the client credentials of MCP server \'jira\', so it was not created: failed to create Secret "jira-oauth-client-ab12c" in namespace "muster": connection refused',
      "Cannot store the client credentials of MCP server 'jira': it has no UID to own the Secret",
      'Cannot store the client credentials of MCP server \'jira\': Permission denied: your user may not create Secret "jira-oauth-client-ab12c" (secrets) in namespace "muster". Removing the server failed too, so it is left behind without its client: delete MCP server \'jira\' (connection refused)',
      'unknown args: [clientCredentials]. Allowed args: [name url]',
    ])("leaves muster's failure %j a 500", async message => {
      rejectWith(message);

      const response = await create();

      expect(response.status).toBe(500);
    });

    it('keeps the stack of the tool error it answers 422', async () => {
      const error = toolError(refusal);
      callTool.mockRejectedValue(error);

      const response = await create();

      // The 422 is muster's own error's, not a copy's without its stack.
      expect(response.status).toBe(422);
      expect(error.status).toBe(422);
    });

    it.each(['core_mcpserver_update', 'core_mcpserver_validate'])(
      "answers %s's refusal as a 422 too",
      async name => {
        rejectWith(refusal);

        const response = await request(await personApp())
          .post('/call')
          .set(MUSTER_AUTH_HEADER, 'user-token')
          .send({ name, arguments: { name: 'jira' } });

        expect(response.status).toBe(422);
        expect(response.body.error.message).toBe(refusal);
      },
    );

    it.each([
      'core_mcpserver_get',
      'core_mcpserver_list',
      'core_mcpserver_detect',
      'core_mcpserver_delete',
    ])("leaves %s's tool error a 500", async name => {
      rejectWith('not found');

      const response = await request(await personApp())
        .post('/call')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send({ name, arguments: { name: 'jira' } });

      expect(response.status).toBe(500);
    });

    it('leaves an outage a 5xx', async () => {
      callTool.mockRejectedValue(new Error('fetch failed'));

      const response = await create();

      expect(response.status).toBe(500);
    });
  });

  describe('/call/progress', () => {
    const lines = (text: string) =>
      text
        .trim()
        .split('\n')
        .map(line => JSON.parse(line));
    const sweep = async (body: object) =>
      request(await personApp())
        .post('/call/progress')
        .set(MUSTER_AUTH_HEADER, 'user-token')
        .send(body);

    it("streams the tool's progress, then its result, as lines", async () => {
      callToolWithProgress.mockImplementation(async (_name, _args, options) => {
        options.onProgress({ progress: 1, message: '0 of 2 PRs done' });
        options.onProgress({ progress: 2, message: '2 of 2 PRs done' });
        return { swept: 2 };
      });

      const response = await sweep({
        name: 'x_marge_sweep',
        arguments: { team: 'honeybadger' },
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/application\/x-ndjson/);
      expect(lines(response.text)).toEqual([
        { type: 'progress', progress: 1, message: '0 of 2 PRs done' },
        { type: 'progress', progress: 2, message: '2 of 2 PRs done' },
        { type: 'result', result: { swept: 2 } },
      ]);
      expect(callToolWithProgress).toHaveBeenCalledWith(
        'x_marge_sweep',
        { team: 'honeybadger' },
        expect.objectContaining({
          ...asPerson,
          signal: expect.any(AbortSignal),
        }),
      );
    });

    it('answers a failure before the first line as an ordinary error', async () => {
      callToolWithProgress.mockRejectedValue(
        new MusterToolError('no team file for "x"'),
      );

      const response = await sweep({ name: 'x_marge_sweep', arguments: {} });

      expect(response.status).toBe(500);
      expect(response.body.error).toMatchObject({
        name: 'MusterToolError',
        message: 'no team file for "x"',
      });
    });

    it('ends a started stream with an error line', async () => {
      callToolWithProgress.mockImplementation(async (_name, _args, options) => {
        options.onProgress({ progress: 1, message: '1 of 3 PRs done' });
        throw new MusterToolError('refused', ['{"why":"x"}']);
      });

      const response = await sweep({ name: 'x_marge_sweep', arguments: {} });

      expect(response.status).toBe(200);
      expect(lines(response.text)).toEqual([
        { type: 'progress', progress: 1, message: '1 of 3 PRs done' },
        {
          type: 'error',
          error: {
            name: 'MusterToolError',
            message: 'refused',
            details: ['{"why":"x"}'],
          },
        },
      ]);
    });

    it('requires a name', async () => {
      const response = await request(app)
        .post('/call/progress')
        .send({ arguments: {} });

      expect(response.status).toBe(400);
      expect(callToolWithProgress).not.toHaveBeenCalled();
    });

    it.each(['x_agent-manager_start_session', 'workflow_sweep', 'call_tool'])(
      'refuses %s on an installation without per-user auth',
      async name => {
        const response = await request(app)
          .post('/call/progress')
          .send({ name, arguments: {} });

        expect(response.status).toBe(403);
        expect(response.body.error.message).toContain(
          'without an authProvider',
        );
        expect(callToolWithProgress).not.toHaveBeenCalled();
      },
    );
  });

  it('computes workflow stats from executions', async () => {
    callTool.mockResolvedValue({
      executions: [
        {
          status: 'completed',
          duration_ms: 100,
          started_at: '2026-06-01T10:00:00Z',
        },
        {
          status: 'failed',
          duration_ms: 300,
          started_at: '2026-06-01T11:00:00Z',
        },
        {
          status: 'completed',
          duration_ms: 200,
          started_at: '2026-06-02T09:00:00Z',
        },
        { status: 'inprogress', started_at: '2026-06-02T09:30:00Z' },
      ],
      total: 4,
    });

    const response = await request(app).get('/workflows/wf-a/stats');

    expect(response.status).toBe(200);
    expect(callTool).toHaveBeenCalledWith(
      'core_workflow_execution_list',
      { workflow_name: 'wf-a', limit: 200, offset: 0 },
      {},
    );
    expect(response.body).toEqual({
      workflow_name: 'wf-a',
      runs: 4,
      sampled: 4,
      completed: 2,
      failed: 1,
      inprogress: 1,
      success_rate: 2 / 3,
      avg_duration_ms: 200,
      max_duration_ms: 300,
      per_day: [
        { date: '2026-06-01', completed: 1, failed: 1 },
        { date: '2026-06-02', completed: 1, failed: 0 },
      ],
    });
  });

  describe('multi-installation routing', () => {
    it('requires the installation parameter when several are configured', async () => {
      const multiApp = await buildMultiApp([
        { name: 'gazelle', url: 'http://g/mcp' },
        { name: 'graveler', url: 'http://gr/mcp' },
      ]);

      const response = await request(multiApp).get('/workflows');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('installation');
      expect(callTool).not.toHaveBeenCalled();
    });

    it('rejects an unknown installation', async () => {
      const multiApp = await buildMultiApp([
        { name: 'gazelle', url: 'http://g/mcp' },
        { name: 'graveler', url: 'http://gr/mcp' },
      ]);

      const response = await request(multiApp).get(
        '/workflows?installation=nope',
      );

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('nope');
    });

    it('routes to the named installation', async () => {
      const multiApp = await buildMultiApp([
        { name: 'gazelle', url: 'http://g/mcp' },
        { name: 'graveler', url: 'http://gr/mcp' },
      ]);
      callTool.mockResolvedValue({ workflows: [] });

      const response = await request(multiApp).get(
        '/workflows?installation=graveler',
      );

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith('core_workflow_list', {}, {});
    });
  });

  describe('with an authProvider-protected server', () => {
    async function buildAuthApp() {
      const logger = mockServices.logger.mock();
      const config = mockServices.rootConfig({
        data: {
          aiChat: {
            mcp: [
              {
                name: 'muster',
                url: 'http://muster/mcp',
                authProvider: 'mcp-muster',
              },
            ],
          },
        },
      });
      const router = await createRouter({
        logger,
        config,
        httpAuth: mockServices.httpAuth(),
        client: { callTool } as unknown as MusterMcpClient,
      });
      const authApp = expressApp();
      authApp.use(router);
      authApp.use(MiddlewareFactory.create({ logger, config }).error());
      return authApp;
    }

    it('forwards the user token to the client', async () => {
      const authApp = await buildAuthApp();
      callTool.mockResolvedValue({ workflows: [] });

      const response = await request(authApp)
        .get('/workflows')
        .set(MUSTER_AUTH_HEADER, 'user-token');

      expect(response.status).toBe(200);
      expect(callTool).toHaveBeenCalledWith(
        'core_workflow_list',
        {},
        { authToken: 'user-token' },
      );
    });

    it('returns 401 when the user token is missing', async () => {
      const authApp = await buildAuthApp();

      const response = await request(authApp).get('/workflows');

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain('mcp-muster');
      expect(callTool).not.toHaveBeenCalled();
    });
  });

  /**
   * giantswarm/giantswarm#38779: a 401 with an empty body left the page and
   * the logs guessing. Every 401 now names its reason, which the frontend
   * picks its action from, and is logged with it -- never with the token.
   */
  describe('every 401 says why', () => {
    /** An unsigned JWT that expires at `exp` (seconds since the epoch). */
    function jwt(exp: number): string {
      const b64url = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');
      return `${b64url({ alg: 'RS256' })}.${b64url({
        sub: 'person-subject',
        exp: Math.floor(exp),
      })}.sig`;
    }
    const LIVE = jwt(Date.now() / 1000 + 600);
    const EXPIRED = jwt(Date.now() / 1000 - 60);

    async function buildCallApp() {
      const logger = mockServices.logger.mock();
      const config = mockServices.rootConfig({
        data: {
          muster: {
            installations: [
              {
                name: 'gazelle',
                url: 'https://muster.gazelle.example.io/mcp',
                authProvider: 'mcp-muster',
              },
            ],
          },
        },
      });
      const router = await createRouter({
        logger,
        config,
        httpAuth: mockServices.httpAuth(),
        client: mockClient,
        reachability: reachableEverywhere(),
      });
      const callApp = expressApp();
      callApp.use(router);
      callApp.use(MiddlewareFactory.create({ logger, config }).error());
      return { callApp, logger };
    }

    const call = (callApp: express.Express, token?: string) => {
      const pending = request(callApp)
        .post('/call?installation=gazelle')
        .send({ name: 'x_cluster-manager_list_clusters', arguments: {} });
      return token ? pending.set(MUSTER_AUTH_HEADER, token) : pending;
    };

    /** Everything the 401 put in the log, as one string. */
    const logged = (logger: ReturnType<typeof mockServices.logger.mock>) =>
      JSON.stringify(
        [logger.info, logger.warn, logger.error].flatMap(fn => fn.mock.calls),
      );

    it('says a server needs the person sign-in, and names the server', async () => {
      const { callApp, logger } = await buildCallApp();
      callTool.mockRejectedValue(
        new MusterAuthRequiredError(
          'cluster-manager',
          'https://muster.gazelle.example.io/oauth/proxy/start?state=abc',
          ["auth_required: server 'cluster-manager' requires authentication"],
        ),
      );

      const response = await call(callApp, LIVE);

      expect(response.status).toBe(401);
      expect(response.body.error).toEqual({
        name: 'MusterUnauthorizedError',
        message:
          "auth_required: server 'cluster-manager' requires authentication; sign in to it to use its tools.",
        reason: 'server_sign_in_required',
        server: 'cluster-manager',
      });
      expect(logger.info).toHaveBeenCalledWith('Muster request answered 401', {
        installation: 'gazelle',
        route: '/call',
        reason: 'server_sign_in_required',
        server: 'cluster-manager',
      });
      // The sign-in link is the person's: the page asks for its own.
      expect(JSON.stringify(response.body)).not.toContain('state=abc');
    });

    it('says the token is missing', async () => {
      const { callApp, logger } = await buildCallApp();

      const response = await call(callApp);

      expect(response.status).toBe(401);
      expect(response.body.error.reason).toBe('token_missing');
      expect(response.body.error.message).toContain(
        "installation 'gazelle' requires a user token",
      );
      expect(callTool).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Muster request answered 401',
        expect.objectContaining({ reason: 'token_missing' }),
      );
    });

    it('says the token expired, without asking muster', async () => {
      const { callApp, logger } = await buildCallApp();

      const response = await call(callApp, EXPIRED);

      expect(response.status).toBe(401);
      expect(response.body.error.reason).toBe('token_expired');
      expect(callTool).not.toHaveBeenCalled();
      expect(logged(logger)).not.toContain(EXPIRED);
    });

    it("says muster's expired-token answer is an expired token", async () => {
      const { callApp } = await buildCallApp();
      callTool.mockRejectedValue(
        new MusterToolError(
          'token has expired for cluster-manager, re-authenticate to refresh: token is expired',
        ),
      );

      const response = await call(callApp, LIVE);

      expect(response.status).toBe(401);
      expect(response.body.error.reason).toBe('token_expired');
    });

    it('says muster refused a token that has not expired', async () => {
      const { callApp, logger } = await buildCallApp();
      callTool.mockRejectedValue(
        Object.assign(
          new Error(
            'MCP HTTP Transport Error: POSTing to endpoint (HTTP 401): invalid_token for person@example.com',
          ),
          { name: 'MCPClientError', statusCode: 401 },
        ),
      );

      const response = await call(callApp, LIVE);

      expect(response.status).toBe(401);
      expect(response.body.error.reason).toBe('token_rejected');
      // muster's own text may name the person: it stays out of both.
      expect(JSON.stringify(response.body)).not.toContain('person@');
      expect(logged(logger)).not.toContain('person@');
      expect(logged(logger)).not.toContain(LIVE);
    });

    it('says why on the streamed call too, before its first line', async () => {
      const { callApp } = await buildCallApp();

      const response = await request(callApp)
        .post('/call/progress?installation=gazelle')
        .send({ name: 'x_cluster-manager_create_node_pool', arguments: {} });

      expect(response.status).toBe(401);
      expect(response.body.error.reason).toBe('token_missing');
    });

    it('leaves every other failure to the error middleware', async () => {
      const { callApp } = await buildCallApp();
      callTool.mockRejectedValue(new MusterToolError('node pool not found'));

      const response = await call(callApp, LIVE);

      expect(response.status).toBe(500);
      expect(response.body.error.reason).toBeUndefined();
    });
  });

  describe("an installation's muster that cannot be reached", () => {
    async function buildLoggedApp() {
      const logger = mockServices.logger.mock();
      const config = mockServices.rootConfig({ data: {} });
      const router = await createRouter({
        logger,
        config,
        httpAuth: mockServices.httpAuth(),
        client: mockClient,
        reachability: reachableEverywhere(),
      });
      // The error middleware logs through a child logger: route it back here.
      logger.child.mockReturnValue(logger);
      // Mounted under a path, as the backend mounts it, so that a URL relative
      // to the router would show in the body.
      const loggedApp = expressApp();
      loggedApp.use('/api/muster', router);
      loggedApp.use(MiddlewareFactory.create({ logger, config }).error());
      return { loggedApp, logger };
    }

    it('answers 503 itself, with the body the error middleware sends, and does not log it again', async () => {
      const { loggedApp, logger } = await buildLoggedApp();
      listTools.mockRejectedValue(
        new MusterUnreachableError(
          'gazelle',
          'the connection failed (UND_ERR_CONNECT_TIMEOUT)',
        ),
      );
      const answered = await request(loggedApp).get('/api/muster/tools');
      expect(logger.error).not.toHaveBeenCalled();

      // The same failure as a plain ServiceUnavailableError goes through the
      // error middleware: the person gets the same answer either way.
      listTools.mockRejectedValue(
        new ServiceUnavailableError(
          'gazelle did not answer: the connection failed (UND_ERR_CONNECT_TIMEOUT)',
        ),
      );
      const viaMiddleware = await request(loggedApp).get('/api/muster/tools');
      expect(logger.error).toHaveBeenCalledTimes(1);

      expect(answered.status).toBe(503);
      expect(answered.body).toEqual(viaMiddleware.body);
      expect(answered.body.request).toEqual({
        method: 'GET',
        url: '/api/muster/tools',
      });
      expect(answered.body.error).toEqual({
        name: 'ServiceUnavailableError',
        message:
          'gazelle did not answer: the connection failed (UND_ERR_CONNECT_TIMEOUT)',
      });
    });

    it('leaves any other 503 to the error middleware', async () => {
      const { loggedApp, logger } = await buildLoggedApp();
      listTools.mockRejectedValue(
        new ServiceUnavailableError(
          'Muster meta-tool list_tools has no executor',
        ),
      );

      const response = await request(loggedApp).get('/api/muster/tools');

      expect(response.status).toBe(503);
      expect(logger.error).toHaveBeenCalledWith(
        'Request failed with status 503',
        expect.any(ServiceUnavailableError),
      );
    });
  });
});
