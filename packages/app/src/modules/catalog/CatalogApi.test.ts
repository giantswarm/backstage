import { ConfigReader } from '@backstage/core-app-api';
import { SessionState } from '@backstage/core-plugin-api';
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
const USER = {
  type: 'user' as const,
  userEntityRef: 'user:default/admin',
  ownershipEntityRefs: [],
};

function setup(options: { session?: boolean; authProvider?: boolean } = {}) {
  const { authProvider = true } = options;
  let session = options.session ?? true;
  const configApi = new ConfigReader({
    backend: { baseUrl: 'http://backend.test' },
  });
  const discoveryApi = { getBaseUrl: jest.fn(async () => BASE) };
  // The app's fetch: its identity asks for the sign-in once the session is gone.
  const fetchApi = { fetch: jest.fn(async () => new Response('{}')) };
  let signedIn: (identity: typeof USER) => void = () => {};
  const signInDone = new Promise<typeof USER>(resolve => {
    signedIn = resolve;
  });
  const identityApi = {
    getProfileInfo: jest.fn(async () => ({})),
    // The app's identity proxy: resolves once the sign-in page set it.
    getBackstageIdentity: jest.fn(() => signInDone),
    getCredentials: jest.fn(async () => ({ token: 'guest-token' })),
    signOut: jest.fn(async () => {}),
  };
  const getBackstageIdentity = jest.fn(async (_?: { optional?: boolean }) =>
    session ? { token: 'session-token', identity: USER } : undefined,
  );
  const stateSubscribers: ((state: SessionState) => void)[] = [];
  const mainAuthApi = {
    getBackstageIdentity,
    sessionState$: () => ({
      subscribe: (next: (state: SessionState) => void) => {
        stateSubscribers.push(next);
        return { unsubscribe() {}, closed: false };
      },
      [Symbol.observable]() {
        return this;
      },
    }),
  };
  const gsAuthProvidersApi = {
    getMainAuthApi: jest.fn(() => {
      if (!authProvider) {
        throw new Error('No main auth provider configured.');
      }
      return mainAuthApi as any;
    }),
  } as any;
  const sent: Request[] = [];
  jest.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
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
    signIn: () => signedIn(USER),
    setSession(live: boolean) {
      session = live;
      stateSubscribers.forEach(next =>
        next(live ? SessionState.SignedIn : SessionState.SignedOut),
      );
    },
  };
}

afterEach(() => jest.restoreAllMocks());

describe('createSilentReadCatalogClient', () => {
  it('reads with the live session’s token through the optional path', async () => {
    const {
      catalogApi,
      fetchApi,
      identityApi,
      getBackstageIdentity,
      sent,
      signIn,
    } = setup();
    signIn();

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

  it('waits for the sign-in before a read asks for the session', async () => {
    const { catalogApi, getBackstageIdentity, sent, signIn } = setup();

    const read = catalogApi.getEntities();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(getBackstageIdentity).not.toHaveBeenCalled();
    expect(sent).toEqual([]);

    signIn();
    await expect(read).resolves.toEqual({ items: [ENTITY] });
    expect(sent).toHaveLength(1);
  });

  it('fails the catalog page’s getEntities as session-expired without a session, sending nothing and never prompting', async () => {
    const {
      catalogApi,
      fetchApi,
      identityApi,
      getBackstageIdentity,
      sent,
      signIn,
    } = setup({ session: false });
    signIn();

    const error = await catalogApi.getEntities().catch(e => e);

    expect(isSessionExpiredError(error)).toBe(true);
    expect(error.message).toBe('Your session expired, sign in again.');
    expect(getBackstageIdentity).toHaveBeenCalledWith({ optional: true });
    expect(getBackstageIdentity).not.toHaveBeenCalledWith();
    expect(sent).toEqual([]);
    expect(fetchApi.fetch).not.toHaveBeenCalled();
    expect(identityApi.getCredentials).not.toHaveBeenCalled();
  });

  it('asks for the session once while it is gone, and again once a sign-in brings it back', async () => {
    const { catalogApi, getBackstageIdentity, sent, signIn, setSession } =
      setup({ session: false });
    signIn();

    await catalogApi.getEntities().catch(() => undefined);
    await catalogApi.getEntities().catch(() => undefined);
    await catalogApi.getEntityFacets({ facets: ['kind'] }).catch(() => {});
    expect(getBackstageIdentity).toHaveBeenCalledTimes(1);
    expect(sent).toEqual([]);

    setSession(true);
    await expect(catalogApi.getEntities()).resolves.toEqual({
      items: [ENTITY],
    });
    expect(getBackstageIdentity).toHaveBeenCalledTimes(2);
    expect(sent).toHaveLength(1);
  });

  it('keeps the entity-presentation loader (getEntitiesByRefs) silent without a session', async () => {
    const { catalogApi, fetchApi, identityApi, sent, signIn } = setup({
      session: false,
    });
    signIn();
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
    const { catalogApi, sent, signIn } = setup();
    signIn();
    const presentation = DefaultEntityPresentationApi.create({ catalogApi });

    const result = await presentation.forEntity('component:default/web')
      .promise;

    expect(result.primaryTitle).toBe('Web');
    expect(sent.map(r => `${r.method} ${new URL(r.url).pathname}`)).toEqual([
      'POST /api/catalog/entities/by-refs',
    ]);
  });

  it('sends a write the person starts through the app’s fetch, which may ask for the sign-in', async () => {
    const { catalogApi, fetchApi, getBackstageIdentity, sent, signIn } = setup({
      session: false,
    });
    signIn();

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

  it('reads with the app’s identity on a guest portal without a main login provider', async () => {
    const { catalogApi, identityApi, getBackstageIdentity, sent } = setup({
      authProvider: false,
    });

    await catalogApi.getEntities();

    expect(identityApi.getCredentials).toHaveBeenCalled();
    expect(getBackstageIdentity).not.toHaveBeenCalled();
    expect(sent[0].headers.get('X-Backstage-Token')).toBe('Bearer guest-token');
  });
});
