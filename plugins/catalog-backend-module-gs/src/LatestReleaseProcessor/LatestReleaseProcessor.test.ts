import { mockServices } from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import type { GithubCredentialsProvider } from '@backstage/integration';
import { LatestReleaseProcessor } from './LatestReleaseProcessor';

const dummyLocation = { type: 'url', target: 'https://example.com' };
const dummyEmit = jest.fn();
const dummyCache = { get: jest.fn(), set: jest.fn() } as any;

const credentialsProvider: GithubCredentialsProvider = {
  getCredentials: jest.fn().mockResolvedValue({ token: 'fake-token' }),
} as unknown as GithubCredentialsProvider;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function component(
  name: string,
  annotations: Record<string, string> = {},
): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name, namespace: 'default', annotations },
    spec: { type: 'service', lifecycle: 'production', owner: 'team-x' },
  };
}

function makeProcessor(fetchImpl: jest.Mock, cacheTtlMs = 60_000) {
  return new LatestReleaseProcessor({
    logger: mockServices.logger.mock(),
    credentialsProvider,
    cacheTtlMs,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

describe('LatestReleaseProcessor', () => {
  it('annotates a Component with a project-slug using GitHub /releases/latest', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.endsWith('/repos/giantswarm/backstage/releases/latest')) {
        return jsonResponse({
          tag_name: 'v0.115.0',
          published_at: '2026-03-23T13:53:07Z',
          draft: false,
          prerelease: false,
        });
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const processor = makeProcessor(fetchImpl);

    const entity = component('backstage', {
      'github.com/project-slug': 'giantswarm/backstage',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(result.metadata.annotations).toMatchObject({
      'giantswarm.io/latest-release-tag': 'v0.115.0',
      'giantswarm.io/latest-release-date': '2026-03-23T13:53:07Z',
    });
  });

  it('uses release-tag-prefix to match a monorepo child', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes('/releases?')) {
        return jsonResponse([
          {
            tag_name: 'sre/v0.1.5',
            published_at: '2026-05-04T12:00:00Z',
            draft: false,
            prerelease: false,
          },
          {
            tag_name: 'other/v1.0.0',
            published_at: '2026-05-05T12:00:00Z',
            draft: false,
            prerelease: false,
          },
        ]);
      }
      throw new Error(`unexpected url: ${url}`);
    });
    const processor = makeProcessor(fetchImpl);

    const entity = component('klaus-personality-sre', {
      'github.com/project-slug': 'giantswarm/klaus-personalities',
      'giantswarm.io/release-tag-prefix': 'sre/',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(result.metadata.annotations).toMatchObject({
      'giantswarm.io/latest-release-tag': 'sre/v0.1.5',
      'giantswarm.io/latest-release-date': '2026-05-04T12:00:00Z',
    });
  });

  it('leaves the entity untouched when /releases/latest returns 404', async () => {
    const fetchImpl = jest.fn(
      async () => new Response('not found', { status: 404 }),
    );
    const processor = makeProcessor(fetchImpl);

    const entity = component('no-releases', {
      'github.com/project-slug': 'giantswarm/no-releases',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(
      result.metadata.annotations?.['giantswarm.io/latest-release-tag'],
    ).toBeUndefined();
  });

  it('leaves the entity untouched when no tag matches the prefix', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse([
        {
          tag_name: 'other/v1.0.0',
          published_at: '2026-05-05T12:00:00Z',
          draft: false,
          prerelease: false,
        },
      ]),
    );
    const processor = makeProcessor(fetchImpl);

    const entity = component('klaus-personality-sre', {
      'github.com/project-slug': 'giantswarm/klaus-personalities',
      'giantswarm.io/release-tag-prefix': 'sre/',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(
      result.metadata.annotations?.['giantswarm.io/latest-release-tag'],
    ).toBeUndefined();
  });

  it('overwrites existing latest-release annotations with fresh values', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        tag_name: 'v0.115.0',
        published_at: '2026-03-23T13:53:07Z',
        draft: false,
        prerelease: false,
      }),
    );
    const processor = makeProcessor(fetchImpl);

    const entity = component('backstage', {
      'github.com/project-slug': 'giantswarm/backstage',
      'giantswarm.io/latest-release-tag': 'stale-tag',
      'giantswarm.io/latest-release-date': '2020-01-01T00:00:00Z',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(result.metadata.annotations).toMatchObject({
      'giantswarm.io/latest-release-tag': 'v0.115.0',
      'giantswarm.io/latest-release-date': '2026-03-23T13:53:07Z',
    });
  });

  it('skips non-Component kinds', async () => {
    const fetchImpl = jest.fn();
    const processor = makeProcessor(fetchImpl);

    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'System',
      metadata: {
        name: 'klaus',
        annotations: { 'github.com/project-slug': 'giantswarm/klaus' },
      },
      spec: { owner: 'team-x' },
    };
    await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips entities without github.com/project-slug', async () => {
    const fetchImpl = jest.fn();
    const processor = makeProcessor(fetchImpl);

    await processor.preProcessEntity(
      component('no-slug'),
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('caches per (owner/repo, prefix) and only calls GitHub once within the TTL', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        tag_name: 'v0.115.0',
        published_at: '2026-03-23T13:53:07Z',
        draft: false,
        prerelease: false,
      }),
    );
    const processor = makeProcessor(fetchImpl);

    const entity = component('backstage', {
      'github.com/project-slug': 'giantswarm/backstage',
    });

    await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );
    await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent fills for the same cache key', async () => {
    let resolveFetch: (value: Response) => void = () => {};
    const fetchImpl = jest.fn(
      () =>
        new Promise<Response>(resolve => {
          resolveFetch = resolve;
        }),
    );
    const processor = makeProcessor(fetchImpl as unknown as jest.Mock);

    const entity = component('backstage', {
      'github.com/project-slug': 'giantswarm/backstage',
    });

    const p1 = processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );
    const p2 = processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );
    // Let credentialsProvider + fetchImpl invocation actually happen before
    // resolving — the inflight dedupe is between getCacheEntry calls, not
    // between fetchImpl invocations.
    await new Promise(resolve => setImmediate(resolve));
    resolveFetch(
      jsonResponse({
        tag_name: 'v0.115.0',
        published_at: '2026-03-23T13:53:07Z',
        draft: false,
        prerelease: false,
      }),
    );
    await Promise.all([p1, p2]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns the original entity when the GitHub fetch fails', async () => {
    const fetchImpl = jest.fn(
      async () => new Response('forbidden', { status: 403 }),
    );
    const processor = makeProcessor(fetchImpl);

    const entity = component('backstage', {
      'github.com/project-slug': 'giantswarm/backstage',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(result).toBe(entity);
  });
});
