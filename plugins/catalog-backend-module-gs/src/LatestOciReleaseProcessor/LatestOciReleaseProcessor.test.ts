import { mockServices } from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import { NotFoundError } from '@backstage/errors';
import type { ContainerRegistryService } from '@giantswarm/backstage-plugin-gs-node';
import { LatestOciReleaseProcessor } from './LatestOciReleaseProcessor';

const dummyLocation = { type: 'url', target: 'https://example.com' };
const dummyEmit = jest.fn();
const dummyCache = { get: jest.fn(), set: jest.fn() } as any;

type GetTags = ContainerRegistryService['getTags'];

function makeProcessor(getTags: jest.Mock, cacheTtlMs = 60_000) {
  return new LatestOciReleaseProcessor({
    logger: mockServices.logger.mock(),
    containerRegistry: { getTags: getTags as unknown as GetTags },
    cacheTtlMs,
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

describe('LatestOciReleaseProcessor', () => {
  it('annotates a Component with the chart latest stable tag and date', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [
        { tag: '0.115.0', createdAt: '2026-03-23T13:53:07Z' },
        { tag: '0.114.0', createdAt: '2026-03-01T00:00:00Z' },
      ],
      latestStableVersion: '0.115.0',
    });
    const processor = makeProcessor(getTags);

    const entity = component('backstage', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/backstage',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(getTags).toHaveBeenCalledWith(
      'gsoci.azurecr.io',
      'charts/giantswarm/backstage',
      { limit: 500 },
    );
    expect(result.metadata.annotations).toMatchObject({
      'giantswarm.io/latest-release-tag': '0.115.0',
      'giantswarm.io/latest-release-date': '2026-03-23T13:53:07Z',
    });
  });

  it('picks highest semver across multi-chart entities', async () => {
    const getTags = jest.fn(async (_registry: string, repository: string) => {
      if (repository === 'charts/giantswarm/fe-docs') {
        return {
          tags: [{ tag: '0.9.0', createdAt: '2026-04-01T00:00:00Z' }],
          latestStableVersion: '0.9.0',
        };
      }
      if (repository === 'charts/giantswarm/happa') {
        return {
          tags: [{ tag: '1.72.0', createdAt: '2026-02-11T15:44:20Z' }],
          latestStableVersion: '1.72.0',
        };
      }
      throw new Error(`unexpected repository: ${repository}`);
    });
    const processor = makeProcessor(getTags as unknown as jest.Mock);

    const entity = component('happa', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/fe-docs,gsoci.azurecr.io/charts/giantswarm/happa',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(result.metadata.annotations).toMatchObject({
      'giantswarm.io/latest-release-tag': '1.72.0',
      'giantswarm.io/latest-release-date': '2026-02-11T15:44:20Z',
    });
  });

  it('leaves the entity untouched when annotation is absent', async () => {
    const getTags = jest.fn();
    const processor = makeProcessor(getTags);

    const entity = component('no-chart');
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(getTags).not.toHaveBeenCalled();
    expect(result).toBe(entity);
  });

  it('skips non-Component kinds', async () => {
    const getTags = jest.fn();
    const processor = makeProcessor(getTags);

    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'System',
      metadata: {
        name: 'system-x',
        annotations: {
          'giantswarm.io/helmcharts':
            'gsoci.azurecr.io/charts/giantswarm/backstage',
        },
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

    expect(getTags).not.toHaveBeenCalled();
  });

  it('returns the entity unchanged when getTags throws and logs a warning', async () => {
    const getTags = jest.fn().mockRejectedValue(new Error('boom'));
    const processor = makeProcessor(getTags);

    const entity = component('backstage', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/backstage',
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

  it('ignores NotFound for one ref but still annotates from surviving refs', async () => {
    const getTags = jest.fn(async (_registry: string, repository: string) => {
      if (repository === 'charts/giantswarm/missing') {
        throw new NotFoundError('not found');
      }
      return {
        tags: [{ tag: '0.115.0', createdAt: '2026-03-23T13:53:07Z' }],
        latestStableVersion: '0.115.0',
      };
    });
    const processor = makeProcessor(getTags as unknown as jest.Mock);

    const entity = component('backstage', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/missing,gsoci.azurecr.io/charts/giantswarm/backstage',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(result.metadata.annotations).toMatchObject({
      'giantswarm.io/latest-release-tag': '0.115.0',
      'giantswarm.io/latest-release-date': '2026-03-23T13:53:07Z',
    });
  });

  it('emits only the tag annotation when createdAt is null', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '0.115.0', createdAt: null }],
      latestStableVersion: '0.115.0',
    });
    const processor = makeProcessor(getTags);

    const entity = component('backstage', {
      'giantswarm.io/helmcharts': 'ghcr.io/giantswarm/backstage',
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
    ).toBe('0.115.0');
    expect(
      result.metadata.annotations?.['giantswarm.io/latest-release-date'],
    ).toBeUndefined();
  });

  it('overwrites stale latest-release annotations with fresh values', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '0.115.0', createdAt: '2026-03-23T13:53:07Z' }],
      latestStableVersion: '0.115.0',
    });
    const processor = makeProcessor(getTags);

    const entity = component('backstage', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/backstage',
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
      'giantswarm.io/latest-release-tag': '0.115.0',
      'giantswarm.io/latest-release-date': '2026-03-23T13:53:07Z',
    });
  });

  it('skips prerelease tags and picks the highest stable tag', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [
        {
          tag: '3.3.0-ff743e565ca06427672467841e7a63b367c2a0c9',
          createdAt: '2026-05-10T00:00:00Z',
        },
        { tag: '3.3.0-rc1', createdAt: '2026-05-05T00:00:00Z' },
        { tag: '3.2.0', createdAt: '2026-04-01T00:00:00Z' },
        { tag: '3.1.0', createdAt: '2026-03-01T00:00:00Z' },
      ],
      latestStableVersion: '3.2.0',
    });
    const processor = makeProcessor(getTags);

    const entity = component('backstage', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/backstage',
    });
    const result = await processor.preProcessEntity(
      entity,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(result.metadata.annotations).toMatchObject({
      'giantswarm.io/latest-release-tag': '3.2.0',
      'giantswarm.io/latest-release-date': '2026-04-01T00:00:00Z',
    });
  });

  it('leaves the entity unchanged when only prereleases are present', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [
        {
          tag: '3.3.0-ff743e565ca06427672467841e7a63b367c2a0c9',
          createdAt: '2026-05-10T00:00:00Z',
        },
        { tag: '3.3.0-rc1', createdAt: '2026-05-05T00:00:00Z' },
      ],
      latestStableVersion: '3.3.0-ff743e565ca06427672467841e7a63b367c2a0c9',
    });
    const processor = makeProcessor(getTags);

    const entity = component('backstage', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/backstage',
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
    expect(
      result.metadata.annotations?.['giantswarm.io/latest-release-date'],
    ).toBeUndefined();
  });

  it('caches per (registry, repository) across entities within the TTL', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '0.115.0', createdAt: '2026-03-23T13:53:07Z' }],
      latestStableVersion: '0.115.0',
    });
    const processor = makeProcessor(getTags);

    const entityA = component('a', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/backstage',
    });
    const entityB = component('b', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/backstage',
    });

    await processor.preProcessEntity(
      entityA,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );
    await processor.preProcessEntity(
      entityB,
      dummyLocation,
      dummyEmit,
      dummyLocation,
      dummyCache,
    );

    expect(getTags).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent fills for the same chart ref', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const getTags = jest.fn(
      () =>
        new Promise(resolve => {
          resolveFetch = resolve;
        }),
    );
    const processor = makeProcessor(getTags as unknown as jest.Mock);

    const entity = component('backstage', {
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/backstage',
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
    await new Promise(resolve => setImmediate(resolve));
    resolveFetch({
      tags: [{ tag: '0.115.0', createdAt: '2026-03-23T13:53:07Z' }],
      latestStableVersion: '0.115.0',
    });
    await Promise.all([p1, p2]);

    expect(getTags).toHaveBeenCalledTimes(1);
  });
});
