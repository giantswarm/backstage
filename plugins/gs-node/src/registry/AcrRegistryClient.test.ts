import { mockServices } from '@backstage/backend-test-utils';
import { AcrRegistryClient } from './AcrRegistryClient';
import { RegistryAuthClient } from './RegistryAuthClient';
import { MAX_TAG_PAGES } from './registryUtils';

function page(names: string[], next?: string) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'link' && next ? `<${next}>; rel="next"` : null,
    },
    json: async () => ({
      tags: names.map(name => ({ name, createdTime: '2026-09-29T00:00:00Z' })),
    }),
    text: async () => '',
  };
}

function clientWith(fetch: jest.Mock) {
  return new AcrRegistryClient(mockServices.logger.mock(), {
    fetch,
  } as unknown as RegistryAuthClient);
}

describe('AcrRegistryClient.getTags', () => {
  it('follows every page when no limit is given', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        page(
          ['2.0.0', '2.0.0-rc.1'],
          '/acr/v1/charts/my-app/_tags?last=abc&n=999&orderby=timedesc',
        ),
      )
      .mockResolvedValueOnce(page(['1.0.0']));

    const tags = await clientWith(fetch).getTags(
      'gsoci.azurecr.io',
      'charts/my-app',
    );

    expect(tags.map(t => t.tag)).toEqual(['2.0.0', '2.0.0-rc.1', '1.0.0']);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://gsoci.azurecr.io/acr/v1/charts/my-app/_tags?n=999&orderby=timedesc',
    );
    expect(fetch.mock.calls[1][0]).toBe(
      'https://gsoci.azurecr.io/acr/v1/charts/my-app/_tags?last=abc&n=999&orderby=timedesc',
    );
  });

  it('fetches a single page when it holds the limit', async () => {
    const fetch = jest.fn().mockResolvedValue(
      page(
        Array.from({ length: 500 }, (_, i) => `1.0.${i}`),
        '/acr/v1/charts/my-app/_tags?last=x',
      ),
    );

    const tags = await clientWith(fetch).getTags(
      'gsoci.azurecr.io',
      'charts/my-app',
      { limit: 500 },
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('n=500');
    expect(tags).toHaveLength(500);
  });

  it('pages up to a limit larger than the largest page ACR serves', async () => {
    const fetch = jest.fn().mockResolvedValue(
      page(
        Array.from({ length: 999 }, (_, i) => `1.0.${i}`),
        '/acr/v1/charts/my-app/_tags?last=x',
      ),
    );

    const tags = await clientWith(fetch).getTags(
      'gsoci.azurecr.io',
      'charts/my-app',
      { limit: 1500 },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain('n=999');
    expect(tags).toHaveLength(1500);
  });

  it('stops at the page limit', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(page(['1.0.0'], '/acr/v1/charts/my-app/_tags?last=x'));

    await clientWith(fetch).getTags('gsoci.azurecr.io', 'charts/my-app');

    expect(fetch).toHaveBeenCalledTimes(MAX_TAG_PAGES);
  });
});
