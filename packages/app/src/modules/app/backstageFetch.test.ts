import { createReadSilentFetchApi } from './backstageFetch';

const BASE = 'http://backend.test/api/catalog';

function setup() {
  const fetchApi = { fetch: jest.fn(async () => new Response()) };
  const silentFetchApi = { fetch: jest.fn(async () => new Response()) };
  return {
    fetchApi,
    silentFetchApi,
    api: createReadSilentFetchApi({ fetchApi, silentFetchApi }),
  };
}

describe('createReadSilentFetchApi', () => {
  it.each([
    ['GET', `${BASE}/entities`],
    ['HEAD', `${BASE}/entities`],
    ['POST', `${BASE}/entities/by-refs?filter=kind=user`],
    ['POST', `${BASE}/entities/by-query`],
    ['POST', `${BASE}/entity-facets`],
    ['POST', `${BASE}/locations/by-query`],
  ])('sends a %s %s through the silent fetch', async (method, url) => {
    const { api, fetchApi, silentFetchApi } = setup();

    await api.fetch(url, { method });

    expect(silentFetchApi.fetch).toHaveBeenCalledWith(url, { method });
    expect(fetchApi.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['POST', `${BASE}/refresh`],
    ['POST', `${BASE}/locations`],
    ['POST', `${BASE}/analyze-location`],
    ['POST', `${BASE}/validate-entity`],
    ['DELETE', `${BASE}/entities/by-uid/uid-1`],
  ])('sends a %s %s through the app’s fetch', async (method, url) => {
    const { api, fetchApi, silentFetchApi } = setup();

    await api.fetch(url, { method });

    expect(fetchApi.fetch).toHaveBeenCalledWith(url, { method });
    expect(silentFetchApi.fetch).not.toHaveBeenCalled();
  });

  it('reads the method of a Request input', async () => {
    const { api, fetchApi, silentFetchApi } = setup();
    const request = new Request(`${BASE}/refresh`, { method: 'POST' });

    await api.fetch(request);

    expect(fetchApi.fetch).toHaveBeenCalledWith(request, undefined);
    expect(silentFetchApi.fetch).not.toHaveBeenCalled();
  });
});
