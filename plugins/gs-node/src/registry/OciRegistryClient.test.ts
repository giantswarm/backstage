import { mockServices } from '@backstage/backend-test-utils';
import { OciRegistryClient } from './OciRegistryClient';
import { RegistryAuthClient } from './RegistryAuthClient';

function page(tags: string[], next?: string) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'link' && next ? `<${next}>; rel="next"` : null,
    },
    json: async () => ({ name: 'org/app', tags }),
    text: async () => '',
  };
}

describe('OciRegistryClient.getTags', () => {
  it('follows the registry pagination', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(
        page(['1.0.0', 'latest'], '/v2/org/app/tags/list?last=latest&n=2'),
      )
      .mockResolvedValueOnce(page(['2.0.0']));
    const client = new OciRegistryClient(mockServices.logger.mock(), {
      fetch,
    } as unknown as RegistryAuthClient);

    const tags = await client.getTags('ghcr.io', 'org/app');

    expect(tags.map(t => t.tag)).toEqual(['2.0.0', '1.0.0']);
    expect(fetch.mock.calls.map(call => call[0])).toEqual([
      'https://ghcr.io/v2/org/app/tags/list?n=1000',
      'https://ghcr.io/v2/org/app/tags/list?last=latest&n=2',
    ]);
  });

  it('stops paging once it holds the limit', async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(
        page(['1.0.0', '1.1.0'], '/v2/org/app/tags/list?last=1.1.0&n=2'),
      );
    const client = new OciRegistryClient(mockServices.logger.mock(), {
      fetch,
    } as unknown as RegistryAuthClient);

    const tags = await client.getTags('ghcr.io', 'org/app', { limit: 2 });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://ghcr.io/v2/org/app/tags/list?n=2',
    );
    expect(tags.map(t => t.tag)).toEqual(['1.1.0', '1.0.0']);
  });
});

function manifestResponse(status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => ({
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
    }),
    text: async () => '',
  };
}

describe('OciRegistryClient.tagExists', () => {
  function clientReturning(status: number) {
    const fetch = jest.fn().mockResolvedValue(manifestResponse(status));
    const client = new OciRegistryClient(mockServices.logger.mock(), {
      fetch,
    } as unknown as RegistryAuthClient);
    return { client, fetch };
  }

  it('is true when the tag manifest is found', async () => {
    const { client, fetch } = clientReturning(200);

    await expect(
      client.tagExists('gsoci.azurecr.io', 'charts/org/app', '1.0.0'),
    ).resolves.toBe(true);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://gsoci.azurecr.io/v2/charts/org/app/manifests/1.0.0',
    );
  });

  it('is false when the registry answers 404', async () => {
    const { client } = clientReturning(404);

    await expect(
      client.tagExists('gsoci.azurecr.io', 'charts/org/app', '1.0.0'),
    ).resolves.toBe(false);
  });

  it('throws on other registry errors', async () => {
    const { client } = clientReturning(503);

    await expect(
      client.tagExists('gsoci.azurecr.io', 'charts/org/app', '1.0.0'),
    ).rejects.toThrow(/Status: 503/);
  });
});
