import { CatalogClient } from '@backstage/catalog-client';
import { ConfigReader } from '@backstage/core-app-api';
import { SessionState } from '@backstage/core-plugin-api';
import { DefaultEntityPresentationApi } from '@backstage/plugin-catalog';
import {
  isSessionExpiredError,
  SESSION_EXPIRED_MESSAGE,
} from '@giantswarm/backstage-plugin-kubernetes-react';
import { createBackstageFetchApi } from './backstageFetch';

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

function setup(
  options: { session?: boolean; mainAuth?: boolean; gesture?: boolean } = {},
) {
  const { mainAuth = true } = options;
  let session = options.session ?? true;
  let gesture = options.gesture ?? false;
  let signedIn: () => void = () => {};
  const signInDone = new Promise<typeof USER>(resolve => {
    signedIn = () => resolve(USER);
  });
  // The app identity: its getBackstageIdentity resolves once the sign-in page
  // set it; its getCredentials is the interactive path, which may prompt.
  const identityApi = {
    getProfileInfo: jest.fn(async () => ({})),
    getBackstageIdentity: jest.fn(() => signInDone),
    getCredentials: jest.fn(async () => ({ token: 'interactive-token' })),
    signOut: jest.fn(async () => {}),
  };
  const getBackstageIdentity = jest.fn(async (_?: { optional?: boolean }) =>
    session ? { token: 'session-token', identity: USER } : undefined,
  );
  const subscribers: ((state: SessionState) => void)[] = [];
  const mainAuthApi = {
    getBackstageIdentity,
    sessionState$: () => ({
      subscribe: (next: (state: SessionState) => void) => {
        subscribers.push(next);
        return { unsubscribe() {}, closed: false };
      },
      [Symbol.observable]() {
        return this;
      },
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
  const fetchApi = createBackstageFetchApi({
    configApi: new ConfigReader({
      backend: { baseUrl: 'http://backend.test' },
    }),
    discoveryApi: { getBaseUrl: async () => BASE },
    identityApi,
    mainAuthApi: mainAuth ? mainAuthApi : undefined,
    hasUserGesture: () => gesture,
  });
  const catalogApi = new CatalogClient({
    discoveryApi: { getBaseUrl: async () => BASE },
    fetchApi,
  });
  return {
    catalogApi,
    identityApi,
    getBackstageIdentity,
    sent,
    signIn: () => signedIn(),
    setGesture(active: boolean) {
      gesture = active;
    },
    setSession(live: boolean) {
      session = live;
      subscribers.forEach(next =>
        next(live ? SessionState.SignedIn : SessionState.SignedOut),
      );
    },
  };
}

afterEach(() => jest.restoreAllMocks());

describe('createBackstageFetchApi', () => {
  describe('without a user gesture (a timer, a poll, a refetch)', () => {
    it('sends the live session’s token from the optional path', async () => {
      const { catalogApi, identityApi, getBackstageIdentity, sent, signIn } =
        setup();
      signIn();

      await expect(catalogApi.getEntities()).resolves.toEqual({
        items: [ENTITY],
      });

      expect(getBackstageIdentity).toHaveBeenCalledWith({ optional: true });
      expect(sent[0].headers.get('X-Backstage-Token')).toBe(
        'Bearer session-token',
      );
      expect(identityApi.getCredentials).not.toHaveBeenCalled();
    });

    it('waits for the sign-in before it asks for the session', async () => {
      const { catalogApi, getBackstageIdentity, sent, signIn } = setup();

      const read = catalogApi.getEntities();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(getBackstageIdentity).not.toHaveBeenCalled();
      expect(sent).toEqual([]);

      signIn();
      await expect(read).resolves.toEqual({ items: [ENTITY] });
    });

    it('fails the catalog page’s getEntities as session-expired without a session, sending nothing and never prompting', async () => {
      const { catalogApi, identityApi, getBackstageIdentity, sent, signIn } =
        setup({ session: false });
      signIn();

      const error = await catalogApi.getEntities().catch(e => e);

      expect(isSessionExpiredError(error)).toBe(true);
      expect(error.message).toBe(SESSION_EXPIRED_MESSAGE);
      expect(getBackstageIdentity).toHaveBeenCalledWith({ optional: true });
      expect(getBackstageIdentity).not.toHaveBeenCalledWith();
      expect(identityApi.getCredentials).not.toHaveBeenCalled();
      expect(sent).toEqual([]);
    });

    it('keeps the entity-presentation loader (getEntitiesByRefs) silent without a session', async () => {
      const { catalogApi, identityApi, sent, signIn } = setup({
        session: false,
      });
      signIn();
      const presentation = DefaultEntityPresentationApi.create({ catalogApi });

      const result = await presentation.forEntity('component:default/web')
        .promise;

      // The loader falls back to the ref's own name instead of asking.
      expect(result.primaryTitle).toBe('web');
      expect(identityApi.getCredentials).not.toHaveBeenCalled();
      expect(sent).toEqual([]);
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
    });
  });

  describe('with a user gesture (the person clicked or typed)', () => {
    it.each([
      ['a read (an entity picker opened)', 'read'],
      ['a write (Refresh)', 'write'],
    ])(
      'takes the interactive path for %s, which may ask for the sign-in',
      async (_, kind) => {
        const { catalogApi, identityApi, getBackstageIdentity, sent, signIn } =
          setup({ session: false, gesture: true });
        signIn();

        if (kind === 'read') {
          await catalogApi.getEntities();
        } else {
          await catalogApi.refreshEntity('component:default/web');
        }

        expect(identityApi.getCredentials).toHaveBeenCalledTimes(1);
        expect(getBackstageIdentity).not.toHaveBeenCalled();
        expect(sent[0].headers.get('X-Backstage-Token')).toBe(
          'Bearer interactive-token',
        );
      },
    );

    it('decides per request', async () => {
      const { catalogApi, identityApi, sent, signIn, setGesture } = setup({
        session: false,
      });
      signIn();

      await catalogApi.getEntities().catch(() => undefined);
      expect(sent).toEqual([]);
      setGesture(true);
      await catalogApi.getEntities();

      expect(identityApi.getCredentials).toHaveBeenCalledTimes(1);
      expect(sent).toHaveLength(1);
    });
  });

  it('uses the app identity on a guest portal without a main login provider', async () => {
    const { catalogApi, identityApi, sent } = setup({ mainAuth: false });

    await catalogApi.getEntities();

    expect(identityApi.getCredentials).toHaveBeenCalled();
    expect(sent[0].headers.get('X-Backstage-Token')).toBe(
      'Bearer interactive-token',
    );
  });
});
