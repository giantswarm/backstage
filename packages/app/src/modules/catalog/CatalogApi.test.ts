import { ConfigReader } from '@backstage/core-app-api';
import { DefaultEntityPresentationApi } from '@backstage/plugin-catalog';
import { isSessionExpiredError } from '@giantswarm/backstage-plugin-kubernetes-react';
import { createSilentReadCatalogClient } from './CatalogApi';

const BASE = 'http://backend.test/api/catalog';
const ENTITY = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: { name: 'web', namespace: 'default', title: 'Web' },
  spec: {},
};

function setup(options: { session?: boolean; authProvider?: boolean } = {}) {
  const { session = true, authProvider = true } = options;
  const configApi = new ConfigReader({
    backend: { baseUrl: 'http://backend.test' },
    ...(authProvider && { gs: { authProvider: 'dex' } }),
  });
  const discoveryApi = { getBaseUrl: jest.fn(async () => BASE) };
  // The app's fetch: its identity asks for the sign-in once the session is gone.
  const fetchApi = { fetch: jest.fn(async () => new Response('{}')) };
  const identityApi = {
    getCredentials: jest.fn(async () => ({ token: 'guest-token' })),
  };
  const getBackstageIdentity = jest.fn(async (_?: { optional?: boolean }) =>
    session
      ? {
          token: 'session-token',
          identity: {
            type: 'user' as const,
            userEntityRef: 'user:default/admin',
            ownershipEntityRefs: [],
          },
        }
      : undefined,
  );
  const gsAuthProvidersApi = {
    getMainAuthApi: jest.fn(() => ({ getBackstageIdentity }) as any),
  };
  const sent: Request[] = [];
  const globalFetch = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (input, init) => {
      const request = new Request(input as RequestInfo, init);
      sent.push(request);
      const body = request.url.includes('/entities/by-refs')
        ? { items: [ENTITY] }
        : [ENTITY];
      return new Response(JSON.stringify(body), {
        headers: { 'content-type': 'application/json' },
      });
    });
  const catalogApi = createSilentReadCatalogClient({
    configApi,
    discoveryApi,
    fetchApi,
    identityApi,
    gsAuthProvidersApi,
  });
  return {
    catalogApi,
    fetchApi,
    identityApi,
    getBackstageIdentity,
    sent,
    globalFetch,
  };
}

afterEach(() => jest.restoreAllMocks());

describe('createSilentReadCatalogClient', () => {
  it('reads with the live session’s token through the optional path', async () => {
    const { catalogApi, fetchApi, identityApi, getBackstageIdentity, sent } =
      setup();

    await expect(catalogApi.getEntities()).resolves.toEqual({
      items: [ENTITY],
    });

    expect(getBackstageIdentity).toHaveBeenCalledWith({ optional: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].headers.get('X-Backstage-Token')).toBe(
      'Bearer session-token',
    );
    expect(fetchApi.fetch).not.toHaveBeenCalled();
    expect(identityApi.getCredentials).not.toHaveBeenCalled();
  });

  it('fails the catalog page’s getEntities as session-expired without a session, sending nothing and never prompting', async () => {
    const { catalogApi, fetchApi, identityApi, getBackstageIdentity, sent } =
      setup({ session: false });

    const error = await catalogApi.getEntities().catch(e => e);

    expect(isSessionExpiredError(error)).toBe(true);
    expect(getBackstageIdentity).toHaveBeenCalledWith({ optional: true });
    expect(getBackstageIdentity).not.toHaveBeenCalledWith();
    expect(sent).toEqual([]);
    expect(fetchApi.fetch).not.toHaveBeenCalled();
    expect(identityApi.getCredentials).not.toHaveBeenCalled();
  });

  it('keeps the entity-presentation loader (getEntitiesByRefs) silent without a session', async () => {
    const { catalogApi, fetchApi, identityApi, sent } = setup({
      session: false,
    });
    const presentation = DefaultEntityPresentationApi.create({ catalogApi });

    const result = await presentation.forEntity('component:default/web')
      .promise;

    // The loader falls back to the ref's own name instead of asking.
    expect(result.primaryTitle).toBe('web');
    expect(sent).toEqual([]);
    expect(fetchApi.fetch).not.toHaveBeenCalled();
    expect(identityApi.getCredentials).not.toHaveBeenCalled();
  });

  it('loads entity presentations with the live session', async () => {
    const { catalogApi, sent } = setup();
    const presentation = DefaultEntityPresentationApi.create({ catalogApi });

    const result = await presentation.forEntity('component:default/web')
      .promise;

    expect(result.primaryTitle).toBe('Web');
    expect(sent.map(r => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/catalog/entities/by-refs',
    ]);
  });

  it('sends a write the person starts through the app’s fetch, which may ask for the sign-in', async () => {
    const { catalogApi, fetchApi, getBackstageIdentity, sent } = setup({
      session: false,
    });

    await catalogApi.refreshEntity('component:default/web');
    await catalogApi.removeEntityByUid('uid-1');

    expect(fetchApi.fetch).toHaveBeenCalledTimes(2);
    expect(fetchApi.fetch).toHaveBeenNthCalledWith(
      1,
      `${BASE}/refresh`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetchApi.fetch).toHaveBeenNthCalledWith(
      2,
      `${BASE}/entities/by-uid/uid-1`,
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(getBackstageIdentity).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });

  it('reads with the app’s identity on a guest portal without gs.authProvider', async () => {
    const { catalogApi, identityApi, getBackstageIdentity, sent } = setup({
      authProvider: false,
    });

    await catalogApi.getEntities();

    expect(identityApi.getCredentials).toHaveBeenCalled();
    expect(getBackstageIdentity).not.toHaveBeenCalled();
    expect(sent[0].headers.get('X-Backstage-Token')).toBe('Bearer guest-token');
  });
});
