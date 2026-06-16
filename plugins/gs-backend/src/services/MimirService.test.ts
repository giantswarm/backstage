import {
  LoggerService,
  RootConfigService,
} from '@backstage/backend-plugin-api';
import {
  AuthenticationError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import { MimirService } from './MimirService';

jest.mock('node-fetch', () => jest.fn());

import fetch from 'node-fetch';

const mockFetch = fetch as unknown as jest.Mock;

function makeConfig(baseDomain: string): RootConfigService {
  return {
    getOptionalString: (key: string) => {
      if (key === 'gs.installations.alba.baseDomain') return baseDomain;
      return undefined;
    },
  } as unknown as RootConfigService;
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
    json: jest.fn().mockResolvedValue(JSON.parse(body)),
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

  it('throws NotFoundError when baseDomain is not configured', async () => {
    const s = MimirService.create({
      config: makeConfig(''),
      logger: makeLogger(),
    });
    // Override: return undefined for unknown installation
    (s as any).config = {
      getOptionalString: () => undefined,
    } as unknown as RootConfigService;

    await expect(
      s.query({ installationName: 'unknown', query: 'up', oidcToken: 'tok' }),
    ).rejects.toThrow(NotFoundError);
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

  it('throws ServiceUnavailableError on 400 with JSON (bad PromQL)', async () => {
    const jsonBody = JSON.stringify({
      status: 'error',
      errorType: 'bad_data',
      error: 'invalid query',
    });
    mockFetch.mockResolvedValue(
      makeResponse(400, jsonBody, 'application/json'),
    );

    await expect(
      service.query({
        installationName: 'alba',
        query: 'invalid{{',
        oidcToken: 'tok',
      }),
    ).rejects.toThrow(ServiceUnavailableError);
  });

  it('truncates long HTML bodies in ServiceUnavailableError', async () => {
    const longBody = 'x'.repeat(500);
    mockFetch.mockResolvedValue(makeResponse(503, longBody, 'text/plain'));

    await expect(
      service.query({
        installationName: 'alba',
        query: 'up',
        oidcToken: 'tok',
      }),
    ).rejects.toThrow(/…$/);
  });

  it('does not truncate short bodies', async () => {
    const shortBody = 'service down';
    mockFetch.mockResolvedValue(makeResponse(503, shortBody, 'text/plain'));

    await expect(
      service.query({
        installationName: 'alba',
        query: 'up',
        oidcToken: 'tok',
      }),
    ).rejects.toThrow(/service down/);
  });

  it('throws ServiceUnavailableError on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.query({
        installationName: 'alba',
        query: 'up',
        oidcToken: 'tok',
      }),
    ).rejects.toThrow(ServiceUnavailableError);
  });
});
