import {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  InputError,
  NotFoundError,
  serializeError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { ConfigReader } from '@backstage/config';
import { JsonObject } from '@backstage/types';
import { ReportedServiceUnavailableError } from '../errors';
import { MimirService } from './MimirService';
import { MimirUnavailableError } from './MimirUnavailableError';

jest.mock('node-fetch', () => jest.fn());

import fetch from 'node-fetch';

const mockFetch = fetch as unknown as jest.Mock;

function makeConfig(
  baseDomain: string,
  options: { mimirEnabled?: boolean; mimir?: JsonObject } = {},
): RootConfigService {
  return new ConfigReader({
    gs: { installations: { alba: { baseDomain, ...options } } },
  }) as unknown as RootConfigService;
}

function makeLogger(): jest.Mocked<LoggerService> {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<LoggerService>;
}

function makeResponse(
  status: number,
  body: string,
  contentType = 'application/json',
) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => (name === 'content-type' ? contentType : null),
    },
    text: jest.fn().mockResolvedValue(body),
    json: jest.fn().mockImplementation(async () => JSON.parse(body)),
  };
}

describe('MimirService.query', () => {
  let service: MimirService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = MimirService.create({
      config: makeConfig('alba.capi.aws.k8s.3stripes.net'),
      logger: makeLogger(),
    });
  });

  it('returns parsed JSON on 200', async () => {
    const payload = {
      status: 'success',
      data: { resultType: 'vector', result: [] },
    };
    mockFetch.mockResolvedValue(makeResponse(200, JSON.stringify(payload)));

    const result = await service.query({
      installationName: 'alba',
      query: 'up',
      oidcToken: 'tok',
    });

    expect(result.status).toBe('success');
  });

  it('keeps a redacted query out of the debug log', async () => {
    const logger = makeLogger();
    const s = MimirService.create({
      config: makeConfig('alba.example.io'),
      logger,
    });
    mockFetch.mockResolvedValue(
      makeResponse(200, JSON.stringify({ status: 'success', data: {} })),
    );

    await s.query({
      installationName: 'alba',
      query: 'cost{user="me@example.com"}',
      oidcToken: 'tok',
      redactQuery: true,
    });
    await s.query({ installationName: 'alba', query: 'up', oidcToken: 'tok' });

    const logged = logger.debug.mock.calls.map(([message]) => message);
    expect(logged.join('\n')).not.toContain('me@example.com');
    expect(logged[0]).toContain('(query redacted)');
    expect(logged[1]).toContain(': up');
  });

  it('throws NotFoundError when baseDomain is not configured', async () => {
    const s = MimirService.create({
      config: makeConfig(''),
      logger: makeLogger(),
    });
    // Override: return undefined for unknown installation
    (s as any).config = new ConfigReader({});

    await expect(
      s.query({ installationName: 'unknown', query: 'up', oidcToken: 'tok' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError without fetching when mimirEnabled is false', async () => {
    const s = MimirService.create({
      config: makeConfig('alba.capi.aws.k8s.3stripes.net', {
        mimirEnabled: false,
      }),
      logger: makeLogger(),
    });

    await expect(
      s.query({ installationName: 'alba', query: 'up', oidcToken: 'tok' }),
    ).rejects.toThrow(NotFoundError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throws AuthenticationError on 401', async () => {
    mockFetch.mockResolvedValue(makeResponse(401, 'Unauthorized'));

    await expect(
      service.query({
        installationName: 'alba',
        query: 'up',
        oidcToken: 'bad',
      }),
    ).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError on 403', async () => {
    mockFetch.mockResolvedValue(makeResponse(403, 'Forbidden'));

    await expect(
      service.query({
        installationName: 'alba',
        query: 'up',
        oidcToken: 'bad',
      }),
    ).rejects.toThrow(AuthenticationError);
  });

  it('throws AuthenticationError on 400 with text/html (gateway rejection)', async () => {
    const htmlBody = '<html><body>Error 400 — token too large</body></html>';
    mockFetch.mockResolvedValue(
      makeResponse(400, htmlBody, 'text/html; charset=utf-8'),
    );

    await expect(
      service.query({
        installationName: 'alba',
        query: 'up',
        oidcToken: 'large-token',
      }),
    ).rejects.toThrow(AuthenticationError);
  });

  it("throws InputError with Mimir's text on 400 with JSON (bad PromQL), without a warning", async () => {
    const logger = makeLogger();
    const s = MimirService.create({
      config: makeConfig('alba.example.io'),
      logger,
    });
    const jsonBody = JSON.stringify({
      status: 'error',
      errorType: 'bad_data',
      error: 'invalid query',
    });
    mockFetch.mockResolvedValue(
      makeResponse(400, jsonBody, 'application/json'),
    );

    const error = await s
      .query({ installationName: 'alba', query: 'invalid{{', oidcToken: 'tok' })
      .catch(e => e);

    // A refused query is the request's fault, not an outage: a 400, which the
    // error middleware does not report, and Mimir's text for the person.
    expect(error).toBeInstanceOf(InputError);
    expect(error.message).toBe(
      'Mimir refused the query for installation "alba" (HTTP 400): invalid query',
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  describe('a Mimir 5xx', () => {
    const storeGatewayError =
      'failed to get store-gateway replication set owning the block 01M6J4WJ6AZPGNQ411Y6ZRMXYG: at least 1 healthy replica required, could only find 0 - unhealthy instances: 100.64.117.138:9095';
    const storeGatewayBody = JSON.stringify({
      status: 'error',
      errorType: 'internal',
      error: storeGatewayError,
    });

    async function fail(body: string, status = 500) {
      const logger = makeLogger();
      const s = MimirService.create({
        config: makeConfig('alba.example.io'),
        logger,
      });
      mockFetch.mockResolvedValue(makeResponse(status, body));
      const error = await s
        .query({ installationName: 'alba', query: 'up', oidcToken: 'tok' })
        .catch(e => e);
      return { error, logger };
    }

    it("throws a reported 503 with a fixed message, and keeps Mimir's text out of it", async () => {
      const { error } = await fail(storeGatewayBody);

      expect(error).toBeInstanceOf(MimirUnavailableError);
      expect(error).toBeInstanceOf(ReportedServiceUnavailableError);
      expect(error).toBeInstanceOf(ServiceUnavailableError);
      expect(error.name).toBe('ServiceUnavailableError');
      expect(error.message).toBe(
        'Mimir could not answer the query for installation "alba" (HTTP 500)',
      );
      expect(error.mimirError).toBe(storeGatewayError);
    });

    it("leaves Mimir's text out of the answer the browser gets", async () => {
      const { error } = await fail(storeGatewayBody);

      const serialized = serializeError(error);
      expect(serialized).not.toHaveProperty('mimirError');
      expect(JSON.stringify(serialized)).not.toContain('100.64.117.138');
      expect(serialized).toMatchObject({ reason: 'older_data_unavailable' });
    });

    it("logs it once as a warning, with the installation, status and Mimir's error in metadata", async () => {
      const { logger } = await fail(storeGatewayBody);

      expect(logger.warn).toHaveBeenCalledTimes(1);
      const [message, metadata] = logger.warn.mock.calls[0];
      expect(message).not.toContain('alba');
      expect(message).not.toContain('01M6J4WJ6AZPGNQ411Y6ZRMXYG');
      expect(metadata).toEqual({
        installation: 'alba',
        endpoint: 'query',
        status: 500,
        mimirError: storeGatewayError,
      });
    });

    it('logs the same message for every installation and every block', async () => {
      const first = await fail(storeGatewayBody);
      const second = await fail(storeGatewayBody.replace('01M6J4', '02ZZZZ'));

      expect(first.logger.warn.mock.calls[0][0]).toBe(
        second.logger.warn.mock.calls[0][0],
      );
    });

    it.each([
      storeGatewayError,
      'no store-gateway instance left after checking exclude for block 01M6J4WJ6AZPGNQ411Y6ZRMXYG',
      'consistency check failed because some blocks were not queried: 01M6J4WJ6AZPGNQ411Y6ZRMXYG',
    ])('recognises a missing store-gateway: %s', async mimirError => {
      const { error, logger } = await fail(
        JSON.stringify({
          status: 'error',
          errorType: 'internal',
          error: mimirError,
        }),
      );

      expect(error.reason).toBe('older_data_unavailable');
      expect(logger.warn.mock.calls[0][0]).toBe(
        'Mimir could not read older data: no healthy store-gateway',
      );
    });

    it.each([
      'rpc error: code = Canceled desc = context canceled while querying store-gateway 10.0.0.1:9095',
      'the query exceeded the limit of chunks fetched from store-gateways',
    ])(
      'gives no reason for another failure that mentions a store-gateway: %s',
      async mimirError => {
        const { error } = await fail(
          JSON.stringify({
            status: 'error',
            errorType: 'internal',
            error: mimirError,
          }),
        );

        expect(error.reason).toBeUndefined();
      },
    );

    it('gives no reason for any other failure', async () => {
      const { error, logger } = await fail(
        JSON.stringify({
          status: 'error',
          errorType: 'internal',
          error: 'boom',
        }),
        502,
      );

      expect(error.reason).toBeUndefined();
      expect(logger.warn.mock.calls[0][0]).toBe(
        'Mimir answered a query with HTTP 502',
      );
    });

    it('keeps a body that is not JSON, shortened', async () => {
      const { error } = await fail('x'.repeat(1500), 503);

      expect(error.mimirError).toHaveLength(1001);
      expect(error.mimirError).toMatch(/…$/);
      expect(error.message).not.toContain('xxx');
    });
  });

  it('throws a reported MimirUnavailableError on a network error, logged once', async () => {
    const logger = makeLogger();
    const s = MimirService.create({
      config: makeConfig('alba.example.io'),
      logger,
    });
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    const error = await s
      .query({ installationName: 'alba', query: 'up', oidcToken: 'tok' })
      .catch(e => e);

    expect(error).toBeInstanceOf(MimirUnavailableError);
    expect(error.message).toBe(
      'Mimir could not be reached for installation "alba"',
    );
    expect(error.mimirError).toBe('ECONNREFUSED');
    expect(logger.warn).toHaveBeenCalledWith('Mimir could not be reached', {
      installation: 'alba',
      endpoint: 'query',
      mimirError: 'ECONNREFUSED',
    });
  });

  it('keeps the query, which can name a person, out of a connection error', async () => {
    const logger = makeLogger();
    const s = MimirService.create({
      config: makeConfig('alba.example.io'),
      logger,
    });
    // node-fetch's FetchError names the whole URL, query string and all.
    mockFetch.mockImplementation(async (url: string) => {
      throw new Error(
        `request to ${url} failed, reason: getaddrinfo ENOTFOUND`,
      );
    });

    const error = await s
      .query({
        installationName: 'alba',
        query: 'cost{user="me@example.com"}',
        oidcToken: 'tok',
        redactQuery: true,
      })
      .catch(e => e);

    const expected =
      'request to https://observability.alba.example.io/prometheus/api/v1/query failed, reason: getaddrinfo ENOTFOUND';
    expect(error.mimirError).toBe(expected);
    expect(logger.warn.mock.calls[0][1]).toMatchObject({
      mimirError: expected,
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
      'example.com"',
    );
  });

  it('logs a failure at debug, not warn, for a caller that handles it', async () => {
    const logger = makeLogger();
    const s = MimirService.create({
      config: makeConfig('alba.example.io'),
      logger,
    });
    mockFetch.mockResolvedValue(
      makeResponse(500, JSON.stringify({ status: 'error', error: 'boom' })),
    );

    await expect(
      s.query({
        installationName: 'alba',
        query: 'up',
        oidcToken: 'tok',
        logFailures: false,
      }),
    ).rejects.toThrow(MimirUnavailableError);
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      'Mimir answered a query with HTTP 500',
      expect.objectContaining({ installation: 'alba', status: 500 }),
    );
  });

  it('does not warn about a refused token', async () => {
    const logger = makeLogger();
    const s = MimirService.create({
      config: makeConfig('alba.example.io'),
      logger,
    });
    mockFetch.mockResolvedValue(makeResponse(401, 'Unauthorized'));

    await expect(
      s.query({ installationName: 'alba', query: 'up', oidcToken: 'bad' }),
    ).rejects.toThrow(AuthenticationError);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('MimirService.queryRange', () => {
  let service: MimirService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = MimirService.create({
      config: makeConfig('alba.capi.aws.k8s.3stripes.net'),
      logger: makeLogger(),
    });
  });

  it('hits query_range with the whole window and returns a matrix', async () => {
    const payload = {
      status: 'success',
      data: {
        resultType: 'matrix',
        result: [
          { metric: { model: 'sonnet' }, values: [[1757462400, '1.5']] },
        ],
      },
    };
    mockFetch.mockResolvedValue(makeResponse(200, JSON.stringify(payload)));

    const result = await service.queryRange({
      installationName: 'alba',
      query: 'sum(increase(cost[1d]))',
      start: '1754870400',
      end: '1757462400',
      step: '1d',
      oidcToken: 'tok',
    });

    expect(result.data.result[0].values).toEqual([[1757462400, '1.5']]);

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.pathname).toBe('/prometheus/api/v1/query_range');
    // Every window parameter has to reach Mimir: dropping one silently returns
    // an instant-shaped answer, which the matrix reducers read as no data.
    expect(url.searchParams.get('query')).toBe('sum(increase(cost[1d]))');
    expect(url.searchParams.get('start')).toBe('1754870400');
    expect(url.searchParams.get('end')).toBe('1757462400');
    expect(url.searchParams.get('step')).toBe('1d');
  });

  it('sends the OIDC token and the tenant header', async () => {
    mockFetch.mockResolvedValue(
      makeResponse(200, JSON.stringify({ status: 'success', data: {} })),
    );

    await service.queryRange({
      installationName: 'alba',
      query: 'up',
      start: '1',
      end: '2',
      step: '1d',
      oidcToken: 'tok',
    });

    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer tok',
      'X-Scope-OrgID': 'giantswarm',
    });
  });

  it("throws InputError with Mimir's text when the range exceeds Mimir point limit", async () => {
    mockFetch.mockResolvedValue(
      makeResponse(
        422,
        JSON.stringify({ error: 'exceeded maximum resolution' }),
      ),
    );

    await expect(
      service.queryRange({
        installationName: 'alba',
        query: 'up',
        start: '1',
        end: '2',
        step: '1s',
        oidcToken: 'tok',
      }),
    ).rejects.toThrow(
      new InputError(
        'Mimir refused the query for installation "alba" (HTTP 422): exceeded maximum resolution',
      ),
    );
  });
});

describe('MimirService with `gs.installations.<name>.mimir`', () => {
  const ok = () =>
    makeResponse(200, JSON.stringify({ status: 'success', data: {} }));

  function serviceWith(mimir: JsonObject, logger = makeLogger()) {
    return MimirService.create({
      config: makeConfig('gerbil.example.net', { mimir }),
      logger,
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(ok());
  });

  it('passes a query through unchanged without `mimir`, to the derived address and tenant', async () => {
    const service = MimirService.create({
      config: makeConfig('gerbil.example.net'),
      logger: makeLogger(),
    });
    // Odd spacing and a selector with no matchers: a rewrite would show.
    const query = 'sum  by(model)( rate(foo[5m]) )  /  bar';

    await service.query({ installationName: 'alba', query, oidcToken: 'tok' });

    const [href, init] = mockFetch.mock.calls[0];
    const url = new URL(href);
    expect(url.origin).toBe('https://observability.gerbil.example.net');
    expect(url.pathname).toBe('/prometheus/api/v1/query');
    expect(url.searchParams.get('query')).toBe(query);
    expect(init.headers['X-Scope-OrgID']).toBe('giantswarm');
  });

  it('sends even a query it could not parse unchanged without `mimir`', async () => {
    const service = MimirService.create({
      config: makeConfig('gerbil.example.net'),
      logger: makeLogger(),
    });

    await service.query({
      installationName: 'alba',
      query: 'sum(up',
      oidcToken: 'tok',
    });

    expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('query')).toBe(
      'sum(up',
    );
  });

  it('queries `url` with `tenant`, and the OIDC token as before', async () => {
    const service = serviceWith({
      url: 'https://observability.golem.example.net/',
      tenant: 'glean',
    });

    await service.query({
      installationName: 'alba',
      query: 'up',
      oidcToken: 'tok',
    });

    const [href, init] = mockFetch.mock.calls[0];
    expect(new URL(href).origin + new URL(href).pathname).toBe(
      'https://observability.golem.example.net/prometheus/api/v1/query',
    );
    // No matchers: the query as it came.
    expect(new URL(href).searchParams.get('query')).toBe('up');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok',
      'X-Scope-OrgID': 'glean',
    });
  });

  it('needs no baseDomain with a `url`', async () => {
    const service = MimirService.create({
      config: new ConfigReader({
        gs: {
          installations: {
            alba: { mimir: { url: 'https://observability.golem.example.net' } },
          },
        },
      }) as unknown as RootConfigService,
      logger: makeLogger(),
    });

    await service.query({
      installationName: 'alba',
      query: 'up',
      oidcToken: 't',
    });

    expect(new URL(mockFetch.mock.calls[0][0]).host).toBe(
      'observability.golem.example.net',
    );
  });

  it('defaults the address and tenant when `mimir` only sets matchers', async () => {
    const service = serviceWith({ matchers: { cluster_id: 'gerbil' } });

    await service.query({
      installationName: 'alba',
      query: 'up',
      oidcToken: 't',
    });

    const [href, init] = mockFetch.mock.calls[0];
    expect(new URL(href).host).toBe('observability.gerbil.example.net');
    expect(init.headers['X-Scope-OrgID']).toBe('giantswarm');
  });

  it('adds the matchers to every selector of an instant query', async () => {
    const service = serviceWith({
      url: 'https://observability.golem.example.net',
      matchers: { cluster_id: 'gerbil', cluster_type: 'workload_cluster' },
    });

    await service.query({
      installationName: 'alba',
      query: 'sum(rate(a[5m])) / sum(b)',
      oidcToken: 'tok',
    });

    expect(new URL(mockFetch.mock.calls[0][0]).searchParams.get('query')).toBe(
      'sum(rate(a{cluster_id="gerbil",cluster_type="workload_cluster"}[5m])) / sum(b{cluster_id="gerbil",cluster_type="workload_cluster"})',
    );
  });

  it('adds the matchers to a range query, and keeps its window', async () => {
    const service = serviceWith({ matchers: { cluster_id: 'gerbil' } });

    await service.queryRange({
      installationName: 'alba',
      query: 'sum(increase(cost[1d]))',
      start: '1',
      end: '2',
      step: '1d',
      oidcToken: 'tok',
    });

    const url = new URL(mockFetch.mock.calls[0][0]);
    expect(url.searchParams.get('query')).toBe(
      'sum(increase(cost{cluster_id="gerbil"}[1d]))',
    );
    expect(url.searchParams.get('start')).toBe('1');
    expect(url.searchParams.get('end')).toBe('2');
    expect(url.searchParams.get('step')).toBe('1d');
  });

  it.each([
    ['a conflicting matcher', 'up{cluster_id="golem"}', /conflicts/],
    [
      'a regex on the enforced label that excludes its value',
      'up{cluster_id=~"golem.*"}',
      /conflicts/,
    ],
    ['a query that does not parse', 'sum(up', /could not be parsed/],
  ])(
    'refuses %s with a 400, without sending it, logged at info',
    async (_, query, reason) => {
      const logger = makeLogger();
      const service = serviceWith(
        { matchers: { cluster_id: 'gerbil' } },
        logger,
      );

      const refused = service.query({
        installationName: 'alba',
        query,
        oidcToken: 'tok',
      });

      await expect(refused).rejects.toThrow(InputError);
      await expect(refused).rejects.toThrow(reason);
      await expect(refused).rejects.toThrow(/installation "alba"/);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Refused a Mimir query that could not be limited',
        expect.objectContaining({ installation: 'alba' }),
      );
    },
  );

  it('refuses a range query it cannot limit, too', async () => {
    const service = serviceWith({ matchers: { cluster_id: 'gerbil' } });

    await expect(
      service.queryRange({
        installationName: 'alba',
        query: 'up{cluster_id!="gerbil"}',
        start: '1',
        end: '2',
        step: '1d',
        oidcToken: 'tok',
      }),
    ).rejects.toThrow(InputError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps a redacted query out of the refusal and the logs', async () => {
    const logger = makeLogger();
    const service = serviceWith({ matchers: { cluster_id: 'gerbil' } }, logger);

    await expect(
      service.query({
        installationName: 'alba',
        query: 'cost{user="me@example.com",cluster_id="golem"}',
        oidcToken: 'tok',
        redactQuery: true,
      }),
    ).rejects.toThrow(InputError);

    const logged = JSON.stringify([
      logger.info.mock.calls,
      logger.debug.mock.calls,
    ]);
    expect(logged).not.toContain('me@example.com');
  });

  it('still refuses every query with `mimirEnabled: false`', async () => {
    const service = MimirService.create({
      config: makeConfig('gerbil.example.net', {
        mimirEnabled: false,
        mimir: { url: 'https://observability.golem.example.net' },
      }),
      logger: makeLogger(),
    });

    await expect(
      service.query({ installationName: 'alba', query: 'up', oidcToken: 't' }),
    ).rejects.toThrow(NotFoundError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['a name that is not a label name', { 'cluster-id': 'gerbil' }],
    ['a value that is not a string', { cluster_id: 7 }],
  ])('throws on %s in `matchers`, without sending', async (_, matchers) => {
    const service = serviceWith({ matchers });

    await expect(
      service.query({ installationName: 'alba', query: 'up', oidcToken: 't' }),
    ).rejects.toThrow(/Invalid config/);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
