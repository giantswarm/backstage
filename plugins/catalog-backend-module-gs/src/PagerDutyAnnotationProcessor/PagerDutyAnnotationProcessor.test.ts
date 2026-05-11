import type { Entity } from '@backstage/catalog-model';
import { PagerDutyAnnotationProcessor } from './PagerDutyAnnotationProcessor';

const dummyLocation = { type: 'url', target: 'https://example.com' };
const dummyEmit = jest.fn();
const dummyCache = { get: jest.fn(), set: jest.fn() };
const dummyLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn().mockReturnThis(),
} as any;

function makeFetch(
  services: Array<{ id: string; name: string }>,
  users: Array<{ id: string; email?: string }>,
): jest.Mock {
  return jest.fn(async (url: string) => {
    if (url.includes('/services')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ services, more: false }),
      } as any;
    }
    if (url.includes('/users')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ users, more: false }),
      } as any;
    }
    throw new Error(`unexpected url ${url}`);
  });
}

function makeProcessor(fetchImpl: jest.Mock) {
  return new PagerDutyAnnotationProcessor({
    apiToken: 'tok',
    apiBaseUrl: 'https://api.eu.pagerduty.com',
    logger: dummyLogger,
    fetchImpl: fetchImpl as any,
  });
}

function group(name: string, annotations: Record<string, string> = {}): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Group',
    metadata: { name, namespace: 'default', annotations },
    spec: { type: 'team', children: [] },
  };
}

function user(
  name: string,
  email: string | undefined,
  annotations: Record<string, string> = {},
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'User',
    metadata: { name, namespace: 'default', annotations },
    spec: { profile: email ? { email } : {}, memberOf: [] },
  };
}

function component(
  name: string,
  owner: string | undefined,
  annotations: Record<string, string> = {},
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name, namespace: 'default', annotations },
    spec: { type: 'service', lifecycle: 'production', ...(owner && { owner }) },
  };
}

async function process(
  processor: PagerDutyAnnotationProcessor,
  entity: Entity,
) {
  return processor.preProcessEntity(
    entity,
    dummyLocation,
    dummyEmit,
    dummyLocation,
    dummyCache as any,
  );
}

beforeEach(() => jest.clearAllMocks());

describe('PagerDutyAnnotationProcessor', () => {
  it('returns processor name', () => {
    const processor = makeProcessor(makeFetch([], []));
    expect(processor.getProcessorName()).toBe('PagerDutyAnnotationProcessor');
  });

  describe('Group entities', () => {
    it('annotates a team-* Group with the matching service id', async () => {
      const fetchImpl = makeFetch(
        [{ id: 'PABC123', name: 'otter-alertmanager' }],
        [],
      );
      const processor = makeProcessor(fetchImpl);
      const result = await process(processor, group('team-otter'));
      expect(result.metadata.annotations).toEqual({
        'pagerduty.com/service-id': 'PABC123',
      });
    });

    it('does not overwrite an existing service-id annotation', async () => {
      const fetchImpl = makeFetch(
        [{ id: 'PABC123', name: 'otter-alertmanager' }],
        [],
      );
      const processor = makeProcessor(fetchImpl);
      const entity = group('team-otter', {
        'pagerduty.com/service-id': 'MANUAL',
      });
      const result = await process(processor, entity);
      expect(result).toBe(entity);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('skips Groups whose name does not start with team-', async () => {
      const fetchImpl = makeFetch(
        [{ id: 'X', name: 'employees-alertmanager' }],
        [],
      );
      const processor = makeProcessor(fetchImpl);
      const result = await process(processor, group('employees'));
      expect(result.metadata.annotations).toEqual({});
    });

    it('skips Groups whose spec.type is not team', async () => {
      const fetchImpl = makeFetch([], []);
      const processor = makeProcessor(fetchImpl);
      const entity: Entity = {
        ...group('team-otter'),
        spec: { type: 'department', children: [] },
      };
      const result = await process(processor, entity);
      expect(result).toBe(entity);
    });

    it('returns the entity unchanged when no PD service matches', async () => {
      const fetchImpl = makeFetch([{ id: 'X', name: 'something-else' }], []);
      const processor = makeProcessor(fetchImpl);
      const entity = group('team-otter');
      const result = await process(processor, entity);
      expect(result.metadata.annotations).toEqual({});
    });
  });

  describe('User entities', () => {
    it('annotates a User by email match', async () => {
      const fetchImpl = makeFetch(
        [],
        [{ id: 'PXYZ789', email: 'jane.doe@example.com' }],
      );
      const processor = makeProcessor(fetchImpl);
      const result = await process(
        processor,
        user('jdoe', 'jane.doe@example.com'),
      );
      expect(result.metadata.annotations).toEqual({
        'pagerduty.com/user-id': 'PXYZ789',
      });
    });

    it('matches emails case-insensitively', async () => {
      const fetchImpl = makeFetch(
        [],
        [{ id: 'PXYZ789', email: 'jane.doe@example.com' }],
      );
      const processor = makeProcessor(fetchImpl);
      const result = await process(
        processor,
        user('jdoe', 'Jane.Doe@Example.COM'),
      );
      expect(result.metadata.annotations).toEqual({
        'pagerduty.com/user-id': 'PXYZ789',
      });
    });

    it('does not overwrite an existing user-id annotation', async () => {
      const fetchImpl = makeFetch(
        [],
        [{ id: 'PXYZ789', email: 'jane.doe@example.com' }],
      );
      const processor = makeProcessor(fetchImpl);
      const entity = user('jdoe', 'jane.doe@example.com', {
        'pagerduty.com/user-id': 'MANUAL',
      });
      const result = await process(processor, entity);
      expect(result).toBe(entity);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('skips Users without an email', async () => {
      const fetchImpl = makeFetch([], []);
      const processor = makeProcessor(fetchImpl);
      const result = await process(processor, user('foo', undefined));
      expect(result.metadata.annotations).toEqual({});
    });
  });

  describe('Component entities', () => {
    it('annotates a Component by deriving service name from owner', async () => {
      const fetchImpl = makeFetch(
        [{ id: 'PABC123', name: 'otter-alertmanager' }],
        [],
      );
      const processor = makeProcessor(fetchImpl);
      const result = await process(
        processor,
        component('my-service', 'team-otter'),
      );
      expect(result.metadata.annotations).toEqual({
        'pagerduty.com/service-id': 'PABC123',
      });
    });

    it('handles full entity-ref owners', async () => {
      const fetchImpl = makeFetch(
        [{ id: 'PABC123', name: 'otter-alertmanager' }],
        [],
      );
      const processor = makeProcessor(fetchImpl);
      const result = await process(
        processor,
        component('my-service', 'group:default/team-otter'),
      );
      expect(result.metadata.annotations).toEqual({
        'pagerduty.com/service-id': 'PABC123',
      });
    });

    it('skips Components owned by a non-team entity', async () => {
      const fetchImpl = makeFetch([], []);
      const processor = makeProcessor(fetchImpl);
      const result = await process(
        processor,
        component('my-service', 'user:default/foo'),
      );
      expect(result.metadata.annotations).toEqual({});
    });

    it('skips Components without an owner', async () => {
      const fetchImpl = makeFetch([], []);
      const processor = makeProcessor(fetchImpl);
      const result = await process(
        processor,
        component('my-service', undefined),
      );
      expect(result.metadata.annotations).toEqual({});
    });

    it('does not overwrite an existing service-id annotation', async () => {
      const fetchImpl = makeFetch(
        [{ id: 'PABC123', name: 'otter-alertmanager' }],
        [],
      );
      const processor = makeProcessor(fetchImpl);
      const entity = component('my-service', 'team-otter', {
        'pagerduty.com/service-id': 'MANUAL',
      });
      const result = await process(processor, entity);
      expect(result).toBe(entity);
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('caching', () => {
    it('fetches once per cache TTL', async () => {
      const fetchImpl = makeFetch(
        [{ id: 'PABC123', name: 'otter-alertmanager' }],
        [{ id: 'PXYZ789', email: 'jane.doe@example.com' }],
      );
      const processor = new PagerDutyAnnotationProcessor({
        apiToken: 'tok',
        apiBaseUrl: 'https://api.eu.pagerduty.com',
        logger: dummyLogger,
        cacheTtlMs: 60_000,
        fetchImpl: fetchImpl as any,
      });
      await process(processor, group('team-otter'));
      await process(processor, user('jdoe', 'jane.doe@example.com'));
      await process(processor, component('my-service', 'team-otter'));
      // Two calls (services + users) per refresh, only one refresh.
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('coalesces concurrent refreshes', async () => {
      const fetchImpl = makeFetch(
        [{ id: 'PABC123', name: 'otter-alertmanager' }],
        [],
      );
      const processor = makeProcessor(fetchImpl);
      await Promise.all([
        process(processor, group('team-otter')),
        process(processor, group('team-otter')),
        process(processor, group('team-otter')),
      ]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('returns entity unchanged when PagerDuty API fails', async () => {
      const fetchImpl = jest.fn(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      })) as unknown as jest.Mock;
      const logger = { ...dummyLogger, warn: jest.fn() };
      const processor = new PagerDutyAnnotationProcessor({
        apiToken: 'tok',
        apiBaseUrl: 'https://api.eu.pagerduty.com',
        logger,
        fetchImpl: fetchImpl as any,
      });
      const entity = group('team-otter');
      const result = await process(processor, entity);
      expect(result.metadata.annotations).toEqual({});
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed to refresh cache'),
      );
    });

    it('paginates when the API reports more results', async () => {
      const fetchImpl = jest.fn(async (url: string) => {
        if (url.includes('/services') && url.includes('offset=0')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              services: [{ id: 'A', name: 'one-alertmanager' }],
              more: true,
            }),
          } as any;
        }
        if (url.includes('/services') && url.includes('offset=1')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({
              services: [{ id: 'B', name: 'two-alertmanager' }],
              more: false,
            }),
          } as any;
        }
        if (url.includes('/users')) {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ users: [], more: false }),
          } as any;
        }
        throw new Error(`unexpected url ${url}`);
      });
      const processor = makeProcessor(fetchImpl as unknown as jest.Mock);
      const result = await process(processor, group('team-two'));
      expect(result.metadata.annotations).toEqual({
        'pagerduty.com/service-id': 'B',
      });
    });
  });
});
