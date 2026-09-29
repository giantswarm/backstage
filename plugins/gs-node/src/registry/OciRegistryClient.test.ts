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
