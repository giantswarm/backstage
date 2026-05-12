import { mockServices } from '@backstage/backend-test-utils';
import {
  getLatestStableRelease,
  listLatestReleasesByPrefix,
} from './githubReleases';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function release(
  tag: string,
  publishedAt: string,
  overrides: { draft?: boolean; prerelease?: boolean } = {},
) {
  return {
    tag_name: tag,
    published_at: publishedAt,
    draft: overrides.draft ?? false,
    prerelease: overrides.prerelease ?? false,
  };
}

describe('listLatestReleasesByPrefix', () => {
  it('matches the first non-draft release per prefix', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse([
        release('sre/v0.2.0', '2026-05-10T10:00:00Z', { draft: true }),
        release('sre/v0.1.5', '2026-05-04T12:00:00Z'),
        release('sre/v0.1.4', '2026-05-01T12:00:00Z'),
        release('devops/v0.0.1-rc.1', '2026-04-30T09:00:00Z', {
          prerelease: true,
        }),
        release('unrelated/v1.0.0', '2026-05-05T12:00:00Z'),
      ]),
    );

    const result = await listLatestReleasesByPrefix({
      owner: 'giantswarm',
      repo: 'klaus-personalities',
      prefixes: ['sre/', 'devops/'],
      token: 'fake',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: mockServices.logger.mock(),
      label: 'test',
    });

    expect(result.get('sre/')).toEqual({
      tag: 'sre/v0.1.5',
      publishedAt: '2026-05-04T12:00:00Z',
    });
    expect(result.get('devops/')).toEqual({
      tag: 'devops/v0.0.1-rc.1',
      publishedAt: '2026-04-30T09:00:00Z',
    });
  });

  it('returns an empty map when prefixes is empty without calling fetch', async () => {
    const fetchImpl = jest.fn();
    const result = await listLatestReleasesByPrefix({
      owner: 'giantswarm',
      repo: 'klaus-personalities',
      prefixes: [],
      token: 'fake',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: mockServices.logger.mock(),
      label: 'test',
    });
    expect(result.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('paginates until every prefix is matched', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) =>
      release(`other/v0.0.${i}`, '2026-01-01T00:00:00Z'),
    );
    const page2 = [
      release('sre/v1.0.0', '2026-05-01T00:00:00Z'),
      release('devops/v2.0.0', '2026-05-02T00:00:00Z'),
    ];
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes('&page=1')) return jsonResponse(page1);
      if (url.includes('&page=2')) return jsonResponse(page2);
      return jsonResponse([]);
    });

    const result = await listLatestReleasesByPrefix({
      owner: 'giantswarm',
      repo: 'klaus-personalities',
      prefixes: ['sre/', 'devops/'],
      token: 'fake',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: mockServices.logger.mock(),
      label: 'test',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.get('sre/')?.tag).toBe('sre/v1.0.0');
    expect(result.get('devops/')?.tag).toBe('devops/v2.0.0');
  });

  it('stops paginating when a partial page is returned', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse([]));

    const result = await listLatestReleasesByPrefix({
      owner: 'giantswarm',
      repo: 'klaus-personalities',
      prefixes: ['sre/'],
      token: 'fake',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: mockServices.logger.mock(),
      label: 'test',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.size).toBe(0);
  });

  it('respects the maxPages cap', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) =>
      release(`other/v0.0.${i}`, '2026-01-01T00:00:00Z'),
    );
    const fetchImpl = jest.fn(async () => jsonResponse(fullPage));

    await listLatestReleasesByPrefix({
      owner: 'giantswarm',
      repo: 'klaus-personalities',
      prefixes: ['sre/'],
      token: 'fake',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: mockServices.logger.mock(),
      label: 'test',
      maxPages: 2,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('getLatestStableRelease', () => {
  it('returns the latest stable release', async () => {
    const fetchImpl = jest.fn(async () =>
      jsonResponse({
        tag_name: 'v0.115.0',
        published_at: '2026-03-23T13:53:07Z',
        draft: false,
        prerelease: false,
      }),
    );

    const result = await getLatestStableRelease({
      owner: 'giantswarm',
      repo: 'backstage',
      token: 'fake',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: mockServices.logger.mock(),
      label: 'test',
    });

    expect(result).toEqual({
      tag: 'v0.115.0',
      publishedAt: '2026-03-23T13:53:07Z',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/giantswarm/backstage/releases/latest',
      expect.anything(),
    );
  });

  it('returns undefined when no stable release exists (404)', async () => {
    const fetchImpl = jest.fn(
      async () => new Response('not found', { status: 404 }),
    );

    const result = await getLatestStableRelease({
      owner: 'giantswarm',
      repo: 'no-releases',
      token: 'fake',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      logger: mockServices.logger.mock(),
      label: 'test',
    });

    expect(result).toBeUndefined();
  });
});
