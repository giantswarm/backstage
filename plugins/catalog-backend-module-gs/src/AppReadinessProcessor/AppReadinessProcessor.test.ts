import { mockServices } from '@backstage/backend-test-utils';
import type { Entity } from '@backstage/catalog-model';
import { NotFoundError } from '@backstage/errors';
import type { ContainerRegistryService } from '@giantswarm/backstage-plugin-gs-node';
import {
  AppReadinessProcessor,
  READINESS_BLOCKED,
  READINESS_RELEASABLE,
  READINESS_UNKNOWN,
  highestStable,
  verdict,
} from './AppReadinessProcessor';

const dummyLocation = { type: 'url', target: 'https://example.com' };
const dummyEmit = jest.fn();
const dummyCache = { get: jest.fn(), set: jest.fn() } as any;

type GetTags = ContainerRegistryService['getTags'];
type GetTagManifest = ContainerRegistryService['getTagManifest'];

const credentialsProvider = {
  getCredentials: jest.fn().mockResolvedValue({ token: undefined }),
} as any;
const integrations = { github: { byUrl: () => undefined } } as any;

/** A `fetch` stand-in answering `/releases/latest` with the given tag. */
function releaseFetch(releaseTag?: string, releaseStatus = 200) {
  return jest.fn().mockResolvedValue({
    ok: releaseStatus === 200,
    status: releaseStatus,
    statusText: 'stubbed',
    json: async () => ({
      tag_name: releaseTag,
      published_at: '2026-01-01T00:00:00Z',
    }),
  });
}

function makeProcessor(options: {
  getTags: jest.Mock;
  getTagManifest?: jest.Mock;
  releaseTag?: string;
  releaseStatus?: number;
  fetchImpl?: jest.Mock;
}) {
  const {
    getTags,
    getTagManifest = jest.fn().mockRejectedValue(new NotFoundError('nope')),
    releaseTag,
    releaseStatus = 200,
    fetchImpl = releaseFetch(releaseTag, releaseStatus),
  } = options;

  return new AppReadinessProcessor({
    logger: mockServices.logger.mock(),
    containerRegistry: {
      getTags: getTags as unknown as GetTags,
      getTagManifest: getTagManifest as unknown as GetTagManifest,
    },
    credentialsProvider,
    integrations,
    cacheTtlMs: 60_000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
}

function component(annotations: Record<string, string> = {}): Entity {
  return {
    apiVersion: 'backstage.io/v1alpha1',
    kind: 'Component',
    metadata: { name: 'my-app', namespace: 'default', annotations },
    spec: { type: 'service', lifecycle: 'production', owner: 'team-x' },
  };
}

const chartAnnotations = {
  'giantswarm.io/helmcharts': 'gsoci.azurecr.io/charts/giantswarm/my-app',
  'github.com/project-slug': 'giantswarm/my-app',
};

async function run(processor: AppReadinessProcessor, entity: Entity) {
  return processor.preProcessEntity(
    entity,
    dummyLocation,
    dummyEmit,
    dummyLocation,
    dummyCache,
  );
}

describe('highestStable', () => {
  it('ignores the artifacthub.io metadata artifact ACR lists as a tag', () => {
    expect(highestStable(['artifacthub.io', '1.2.0', '1.1.0'])).toBe('1.2.0');
  });

  it('ignores prerelease tags pushed by branch builds', () => {
    expect(
      highestStable(['1.3.0-dev.my-branch.20260101.120000.habcdef1', '1.2.0']),
    ).toBe('1.2.0');
  });

  it('does not assume the registry returned tags in order', () => {
    expect(highestStable(['1.2.0', '1.10.0', '1.9.0'])).toBe('1.10.0');
  });

  it('returns undefined when nothing is a stable version', () => {
    expect(highestStable(['artifacthub.io', '2.0.0-dev'])).toBeUndefined();
  });
});

describe('verdict', () => {
  it('drops the v prefix, so v1.6.0 matches chart tag 1.6.0', () => {
    expect(
      verdict('v1.6.0', [{ latestStable: '1.6.0', unreadable: false }]),
    ).toEqual({ readiness: READINESS_RELEASABLE, flags: [] });
  });

  it('blocks when the newest release never reached the registry', () => {
    expect(
      verdict('v1.6.0', [{ latestStable: '1.5.0', unreadable: false }]),
    ).toEqual({
      readiness: READINESS_BLOCKED,
      flags: ['RELEASE-NOT-PUBLISHED'],
    });
  });

  it('blocks when the registry holds no stable version at all', () => {
    expect(
      verdict('v1.6.0', [{ latestStable: undefined, unreadable: false }]),
    ).toEqual({ readiness: READINESS_BLOCKED, flags: ['NEVER-PUBLISHED'] });
  });

  it('is releasable when the registry is ahead of the newest release', () => {
    expect(
      verdict('1.5.0', [{ latestStable: '1.6.0', unreadable: false }]),
    ).toEqual({ readiness: READINESS_RELEASABLE, flags: [] });
  });

  it('reports unknown, never blocked, when no registry could be read', () => {
    expect(
      verdict('1.6.0', [{ latestStable: undefined, unreadable: true }]),
    ).toEqual({ readiness: READINESS_UNKNOWN, flags: [] });
  });

  it('reports unknown for a release tag that is not comparable', () => {
    expect(
      verdict('nightly', [{ latestStable: '1.0.0', unreadable: false }]),
    ).toEqual({ readiness: READINESS_UNKNOWN, flags: [] });
  });

  it('compares a multi-chart component against its highest published chart', () => {
    // Charts in one repo are versioned independently, so requiring every chart
    // to match the repo's release tag would flag normal repos.
    expect(
      verdict('1.6.0', [
        { latestStable: '0.4.0', unreadable: false },
        { latestStable: '1.6.0', unreadable: false },
      ]),
    ).toEqual({ readiness: READINESS_RELEASABLE, flags: [] });
  });

  it('ignores an unreadable chart when another one answered', () => {
    expect(
      verdict('1.6.0', [
        { latestStable: undefined, unreadable: true },
        { latestStable: '1.6.0', unreadable: false },
      ]),
    ).toEqual({ readiness: READINESS_RELEASABLE, flags: [] });
  });
});

describe('AppReadinessProcessor', () => {
  it('labels a published component releasable', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '1.6.0', createdAt: null }],
      latestStableVersion: '1.6.0',
    });
    const processor = makeProcessor({ getTags, releaseTag: 'v1.6.0' });

    const result = await run(processor, component(chartAnnotations));

    expect(result.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_RELEASABLE,
    );
    expect(
      result.metadata.annotations?.['giantswarm.io/readiness-checked'],
    ).toBeDefined();
    expect(
      result.metadata.annotations?.['giantswarm.io/readiness-flags'],
    ).toBeUndefined();
  });

  it('labels an unpublished release blocked and names the blocker', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '1.5.0', createdAt: null }],
      latestStableVersion: '1.5.0',
    });
    const processor = makeProcessor({ getTags, releaseTag: 'v1.6.0' });

    const result = await run(processor, component(chartAnnotations));

    expect(result.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_BLOCKED,
    );
    expect(result.metadata.annotations?.['giantswarm.io/readiness-flags']).toBe(
      'RELEASE-NOT-PUBLISHED',
    );
  });

  it('merges with flags the catalog importer already published', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '1.5.0', createdAt: null }],
      latestStableVersion: '1.5.0',
    });
    const processor = makeProcessor({ getTags, releaseTag: 'v1.6.0' });

    const result = await run(
      processor,
      component({
        ...chartAnnotations,
        'giantswarm.io/readiness-flags': 'NO-VALUES-SCHEMA',
      }),
    );

    expect(result.metadata.annotations?.['giantswarm.io/readiness-flags']).toBe(
      'NO-VALUES-SCHEMA,RELEASE-NOT-PUBLISHED',
    );
  });

  it('does not flag when the exact release tag exists but fell outside the tag window', async () => {
    // The listing is capped at 500 newest tags, so a chart with heavy CI churn
    // can have its newest stable version windowed out. The point lookup is the
    // authority.
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '1.5.0', createdAt: null }],
      latestStableVersion: '1.5.0',
    });
    const getTagManifest = jest.fn().mockResolvedValue({ manifest: {} });
    const processor = makeProcessor({
      getTags,
      getTagManifest,
      releaseTag: 'v1.6.0',
    });

    const result = await run(processor, component(chartAnnotations));

    expect(result.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_RELEASABLE,
    );
    // Asked for the published form of the tag, without the v prefix.
    expect(getTagManifest).toHaveBeenCalledWith(
      'gsoci.azurecr.io',
      'charts/giantswarm/my-app',
      '1.6.0',
    );
  });

  it('skips chart refs that are unsubstituted template placeholders', async () => {
    const getTags = jest.fn();
    const processor = makeProcessor({ getTags, releaseTag: 'v1.0.0' });
    const entity = component({
      'github.com/project-slug': 'giantswarm/my-app',
      'giantswarm.io/helmcharts':
        'gsoci.azurecr.io/charts/giantswarm/{MCP-NAME}',
    });

    const result = await run(processor, entity);

    expect(result).toBe(entity);
    expect(getTags).not.toHaveBeenCalled();
  });

  it('reports unknown when the registry cannot be read', async () => {
    const getTags = jest.fn().mockRejectedValue(new Error('unauthorized'));
    const processor = makeProcessor({ getTags, releaseTag: 'v1.6.0' });

    const result = await run(processor, component(chartAnnotations));

    expect(result.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_UNKNOWN,
    );
  });

  it('treats a chart absent from the registry as never published, not unknown', async () => {
    const getTags = jest.fn().mockRejectedValue(new NotFoundError('nope'));
    const processor = makeProcessor({ getTags, releaseTag: 'v1.6.0' });

    const result = await run(processor, component(chartAnnotations));

    expect(result.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_BLOCKED,
    );
    expect(result.metadata.annotations?.['giantswarm.io/readiness-flags']).toBe(
      'NEVER-PUBLISHED',
    );
  });

  it('reports unknown when the repo has no release', async () => {
    const getTags = jest.fn();
    const processor = makeProcessor({ getTags, releaseStatus: 404 });

    const result = await run(processor, component(chartAnnotations));

    expect(result.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_UNKNOWN,
    );
    expect(getTags).not.toHaveBeenCalled();
  });

  it('reports unknown for a monorepo component with a release tag prefix', async () => {
    const getTags = jest.fn();
    const processor = makeProcessor({ getTags, releaseTag: 'sre/v9.9.9' });

    const result = await run(
      processor,
      component({
        ...chartAnnotations,
        'giantswarm.io/release-tag-prefix': 'sre/',
      }),
    );

    expect(result.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_UNKNOWN,
    );
    expect(getTags).not.toHaveBeenCalled();
  });

  it('leaves entities without a chart annotation untouched', async () => {
    const getTags = jest.fn();
    const processor = makeProcessor({ getTags, releaseTag: 'v1.0.0' });
    const entity = component({ 'github.com/project-slug': 'giantswarm/x' });

    const result = await run(processor, entity);

    expect(result).toBe(entity);
    expect(getTags).not.toHaveBeenCalled();
  });

  it('leaves entities without a project slug untouched', async () => {
    const getTags = jest.fn();
    const processor = makeProcessor({ getTags, releaseTag: 'v1.0.0' });
    const entity = component({
      'giantswarm.io/helmcharts': 'gsoci.azurecr.io/charts/giantswarm/my-app',
    });

    const result = await run(processor, entity);

    expect(result).toBe(entity);
  });

  it('leaves non-Component entities untouched', async () => {
    const getTags = jest.fn();
    const processor = makeProcessor({ getTags, releaseTag: 'v1.0.0' });
    const entity: Entity = {
      apiVersion: 'backstage.io/v1alpha1',
      kind: 'API',
      metadata: { name: 'an-api', annotations: chartAnnotations },
    };

    const result = await run(processor, entity);

    expect(result).toBe(entity);
  });

  it('produces an identical entity on a repeat pass', async () => {
    // The catalog engine skips the write when the processed entity hashes to
    // the same value, so nothing in here may move on its own.
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '1.6.0', createdAt: null }],
      latestStableVersion: '1.6.0',
    });
    const processor = makeProcessor({ getTags, releaseTag: 'v1.6.0' });

    const first = await run(processor, component(chartAnnotations));
    await new Promise(resolve => setTimeout(resolve, 10));
    const second = await run(processor, component(chartAnnotations));

    expect(second).toEqual(first);
  });

  it('caches registry and release lookups across entities', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '1.6.0', createdAt: null }],
      latestStableVersion: '1.6.0',
    });
    const fetchImpl = releaseFetch('v1.6.0');
    const processor = makeProcessor({ getTags, fetchImpl });

    await run(processor, component(chartAnnotations));
    await run(processor, component(chartAnnotations));

    expect(getTags).toHaveBeenCalledTimes(1);
    // The release side is cached too, or it would be one GitHub request per
    // component per processing cycle, doubling what the sibling already asks.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('shares one release lookup between a component\'s charts', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '1.6.0', createdAt: null }],
      latestStableVersion: '1.6.0',
    });
    const fetchImpl = releaseFetch('v1.6.0');
    const processor = makeProcessor({ getTags, fetchImpl });

    await Promise.all([
      run(processor, component(chartAnnotations)),
      run(processor, component(chartAnnotations)),
    ]);

    // In-flight dedup: the concurrent pass shares the pending promise.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed release lookup', async () => {
    const getTags = jest.fn().mockResolvedValue({
      tags: [{ tag: '1.6.0', createdAt: null }],
      latestStableVersion: '1.6.0',
    });
    // 403 is not retried by githubFetch, so it surfaces immediately.
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'forbidden',
        json: async () => ({}),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'ok',
        json: async () => ({
          tag_name: 'v1.6.0',
          published_at: '2026-01-01T00:00:00Z',
        }),
      });
    const processor = makeProcessor({ getTags, fetchImpl });

    const failed = await run(processor, component(chartAnnotations));
    const retried = await run(processor, component(chartAnnotations));

    expect(failed.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_UNKNOWN,
    );
    expect(retried.metadata.labels?.['giantswarm.io/readiness']).toBe(
      READINESS_RELEASABLE,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
