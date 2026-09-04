import { ConfigApi, OAuthRequestApi } from '@backstage/core-plugin-api';
import { openLoginPopup } from '@backstage/core-app-api';
import {
  ClusterTokenError,
  DefaultAuthConnector,
} from './DefaultAuthConnector';

jest.mock('@backstage/core-app-api', () => ({
  ...jest.requireActual('@backstage/core-app-api'),
  openLoginPopup: jest.fn(),
}));
import {
  DiscoveryApiClient,
  NO_INSTALLATION,
} from '../discovery/DiscoveryApiClient';

const configApi = {
  getOptionalBoolean: jest.fn().mockReturnValue(false),
} as unknown as ConfigApi;

const oauthRequestApi: OAuthRequestApi = {
  createAuthRequester: jest.fn(() => jest.fn()),
  authRequest$: jest.fn(),
};

const discoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://backend/api/auth'),
} as unknown as DiscoveryApiClient;

function createConnector(
  clusterTokenProvider?: () => Promise<
    { token: string; expiresInSeconds?: number } | undefined
  >,
) {
  return new DefaultAuthConnector({
    configApi,
    discoveryApi,
    environment: 'development',
    provider: { id: 'oidc-golem', title: 'golem', icon: () => null },
    oauthRequestApi,
    clusterTokenProvider,
  });
}

const legacyRefreshResponse = {
  providerInfo: {
    idToken: 'legacy-id-token',
    accessToken: 'legacy-access-token',
    scope: 'openid',
    expiresInSeconds: 1800,
  },
};

function mockLegacyRefresh(): jest.SpyInstance {
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(legacyRefreshResponse), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('DefaultAuthConnector', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('refreshSession', () => {
    it('mints the session through the broker without touching the cookie refresh', async () => {
      const fetchSpy = mockLegacyRefresh();
      const clusterTokenProvider = jest
        .fn()
        .mockResolvedValue({ token: 'mc-token', expiresInSeconds: 1740 });

      const session = await createConnector(
        clusterTokenProvider,
      ).refreshSession({ scopes: new Set(['openid', 'groups']) });

      expect(clusterTokenProvider).toHaveBeenCalledTimes(1);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(session).toEqual({
        providerInfo: {
          idToken: 'mc-token',
          accessToken: 'mc-token',
          scope: 'openid groups',
          expiresInSeconds: 1740,
        },
      });
    });

    it('propagates the broker error and never falls back to the cookie refresh', async () => {
      const fetchSpy = mockLegacyRefresh();
      const brokerError = new ClusterTokenError('golem', 'broker_unreachable');
      const clusterTokenProvider = jest.fn().mockRejectedValue(brokerError);

      await expect(
        createConnector(clusterTokenProvider).refreshSession({
          scopes: new Set(['openid']),
        }),
      ).rejects.toBe(brokerError);

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws a typed error when the broker yields no token', async () => {
      const fetchSpy = mockLegacyRefresh();
      const clusterTokenProvider = jest.fn().mockResolvedValue(undefined);

      await expect(
        createConnector(clusterTokenProvider).refreshSession({
          scopes: new Set(['openid']),
        }),
      ).rejects.toMatchObject({
        name: 'ClusterTokenError',
        installation: 'golem',
        reason: 'unknown',
      });

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('uses the cookie-based refresh when no broker is configured', async () => {
      const fetchSpy = mockLegacyRefresh();

      const session = await createConnector().refreshSession({
        scopes: new Set(['openid']),
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(session).toEqual(legacyRefreshResponse);
    });
  });

  describe('installation scoping (buildUrl)', () => {
    function createConnectorForProvider(options: {
      providerId: string;
      isMainProvider?: boolean;
    }) {
      const getBaseUrl = jest.fn().mockResolvedValue('http://backend/api/auth');
      const scopedDiscoveryApi = {
        getBaseUrl,
      } as unknown as DiscoveryApiClient;
      const connector = new DefaultAuthConnector({
        configApi,
        discoveryApi: scopedDiscoveryApi,
        environment: 'development',
        provider: {
          id: options.providerId,
          title: options.providerId,
          icon: () => null,
        },
        oauthRequestApi,
        isMainProvider: options.isMainProvider,
      });
      return { connector, getBaseUrl };
    }

    it('does not scope the main sign-in provider to an installation', async () => {
      // Even though the id follows the `oidc-<name>` shape, the main provider
      // (id === gs.authProvider) is not installation-scoped, so auth discovery
      // must be resolved with the NO_INSTALLATION sentinel -- otherwise the
      // static current-installation fallback could mis-scope it to a
      // per-installation backend override (and pre-sign-in discovery would hit
      // the installations-dependent branch).
      mockLegacyRefresh();
      const { connector, getBaseUrl } = createConnectorForProvider({
        providerId: 'oidc-gazelle',
        isMainProvider: true,
      });

      await connector.refreshSession({ scopes: new Set(['openid']) });

      expect(getBaseUrl).toHaveBeenCalledWith('auth', NO_INSTALLATION);
    });

    it('scopes a genuine per-installation provider to its installation', async () => {
      mockLegacyRefresh();
      const { connector, getBaseUrl } = createConnectorForProvider({
        providerId: 'oidc-gazelle',
      });

      await connector.refreshSession({ scopes: new Set(['openid']) });

      expect(getBaseUrl).toHaveBeenCalledWith('auth', 'gazelle');
    });
  });
  describe('startParams', () => {
    const popupResponse = { providerInfo: { idToken: 'id', scope: 'openid' } };

    function createPinnedConnector() {
      return new DefaultAuthConnector({
        configApi,
        discoveryApi,
        environment: 'production',
        provider: { id: 'oidc-gazelle', title: 'gazelle', icon: () => null },
        oauthRequestApi,
        isMainProvider: true,
        startParams: { connector_id: 'giantswarm-ad' },
      });
    }

    it('adds the pinned parameters to the login popup URL', async () => {
      (openLoginPopup as jest.Mock).mockResolvedValue(popupResponse);

      const session = await createPinnedConnector().createSession({
        scopes: new Set(['openid']),
        instantPopup: true,
      });

      expect(session).toEqual(popupResponse);
      const { url } = (openLoginPopup as jest.Mock).mock.calls[0][0];
      const query = new URL(url).searchParams;
      expect(
        url.startsWith('http://backend/api/auth/oidc-gazelle/start?'),
      ).toBe(true);
      expect(query.get('connector_id')).toBe('giantswarm-ad');
      expect(query.get('scope')).toBe('openid');
      expect(query.get('flow')).toBe('popup');
      expect(query.get('env')).toBe('production');
    });

    it('never sends the pinned parameters on a session refresh', async () => {
      const fetchSpy = mockLegacyRefresh();

      await createPinnedConnector().refreshSession({
        scopes: new Set(['openid']),
      });

      const [url] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/oidc-gazelle/refresh?');
      expect(String(url)).not.toContain('connector_id');
    });
  });

  describe('sign-in connector memory', () => {
    const popupResponse = { providerInfo: { idToken: 'id', scope: 'openid' } };

    function fakeMemory(initial?: string) {
      let value = initial;
      return {
        get: jest.fn(() => value),
        remember: jest.fn((connectorId: string) => {
          value = connectorId;
        }),
        forget: jest.fn(() => {
          value = undefined;
        }),
      };
    }

    // Stands in for the OAuthRequestApi's login dialog: the person confirms
    // the queued request right away, which opens the popup.
    const confirmingOauthRequestApi = {
      createAuthRequester: jest.fn(
        ({ onAuthRequest }: { onAuthRequest: (s: Set<string>) => unknown }) =>
          (scopes: Set<string>) =>
            onAuthRequest(scopes),
      ),
      authRequest$: jest.fn(),
    } as unknown as OAuthRequestApi;

    function createMainConnector(options: {
      memory: ReturnType<typeof fakeMemory>;
      startParams?: Record<string, string>;
      configApi?: ConfigApi;
    }) {
      return new DefaultAuthConnector({
        configApi: options.configApi ?? configApi,
        discoveryApi,
        environment: 'production',
        provider: { id: 'oidc-gazelle', title: 'gazelle', icon: () => null },
        oauthRequestApi: confirmingOauthRequestApi,
        isMainProvider: true,
        startParams: options.startParams,
        signInConnectorMemory: options.memory,
      });
    }

    function popupQuery(call = 0): URLSearchParams {
      const { url } = (openLoginPopup as jest.Mock).mock.calls[call][0];
      return new URL(url).searchParams;
    }

    beforeEach(() => {
      (openLoginPopup as jest.Mock).mockReset();
    });

    it('remembers the connector once a pinned login popup succeeds', async () => {
      (openLoginPopup as jest.Mock).mockResolvedValue(popupResponse);
      const memory = fakeMemory();
      const connector = createMainConnector({
        memory,
        startParams: { connector_id: 'giantswarm-ad' },
      });

      await connector.createSession({
        scopes: new Set(['openid']),
        instantPopup: true,
      });

      expect(popupQuery().get('connector_id')).toBe('giantswarm-ad');
      expect(memory.remember).toHaveBeenCalledWith('giantswarm-ad');
      expect(memory.get()).toBe('giantswarm-ad');
    });

    it('leaves the memory alone when the pinned login popup fails', async () => {
      (openLoginPopup as jest.Mock).mockRejectedValue(
        new Error('Login failed, popup was closed'),
      );
      const memory = fakeMemory();
      const connector = createMainConnector({
        memory,
        startParams: { connector_id: 'giantswarm-ad' },
      });

      await expect(
        connector.createSession({
          scopes: new Set(['openid']),
          instantPopup: true,
        }),
      ).rejects.toThrow('popup was closed');

      expect(memory.remember).not.toHaveBeenCalled();
      expect(memory.forget).not.toHaveBeenCalled();
    });

    it('sends the remembered connector on a re-login popup of the unpinned main provider', async () => {
      (openLoginPopup as jest.Mock).mockResolvedValue(popupResponse);
      const memory = fakeMemory('giantswarm-ad');
      const connector = createMainConnector({ memory });

      // No instant popup: the request goes through the login dialog, as the
      // re-login of an expired session does.
      const session = await connector.createSession({
        scopes: new Set(['openid']),
      });

      expect(session).toEqual(popupResponse);
      expect(popupQuery().get('connector_id')).toBe('giantswarm-ad');
      expect(memory.forget).not.toHaveBeenCalled();
    });

    it('sends nothing extra when no connector is remembered', async () => {
      (openLoginPopup as jest.Mock).mockResolvedValue(popupResponse);
      const memory = fakeMemory();
      const connector = createMainConnector({ memory });

      await connector.createSession({ scopes: new Set(['openid']) });

      expect(popupQuery().has('connector_id')).toBe(false);
      expect(memory.remember).not.toHaveBeenCalled();
    });

    it('lets an explicit pin win over the memory and records the pin', async () => {
      (openLoginPopup as jest.Mock).mockResolvedValue(popupResponse);
      const memory = fakeMemory('giantswarm-ad');
      const connector = createMainConnector({
        memory,
        startParams: { connector_id: 'giantswarm-github' },
      });

      await connector.createSession({ scopes: new Set(['openid']) });

      expect(popupQuery().get('connector_id')).toBe('giantswarm-github');
      expect(memory.get()).toBe('giantswarm-github');
    });

    it('never sends the remembered connector on a session refresh', async () => {
      const fetchSpy = mockLegacyRefresh();
      const memory = fakeMemory('giantswarm-ad');

      await createMainConnector({ memory }).refreshSession({
        scopes: new Set(['openid']),
      });

      const [url] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/oidc-gazelle/refresh?');
      expect(String(url)).not.toContain('connector_id');
    });

    it('forgets the connector when the unpinned card is picked on the login page', async () => {
      (openLoginPopup as jest.Mock).mockResolvedValue(popupResponse);
      const memory = fakeMemory('giantswarm-ad');
      const connector = createMainConnector({ memory });

      // The login page's card opens its popup instantly; picking the unpinned
      // card means "the default connector", whatever this browser remembered.
      await connector.createSession({
        scopes: new Set(['openid']),
        instantPopup: true,
      });

      expect(memory.forget).toHaveBeenCalledTimes(1);
      expect(popupQuery().has('connector_id')).toBe(false);
      expect(memory.get()).toBeUndefined();
    });

    it('keeps the memory when the pinned card is picked on the login page', async () => {
      (openLoginPopup as jest.Mock).mockResolvedValue(popupResponse);
      const memory = fakeMemory('giantswarm-ad');
      const connector = createMainConnector({
        memory,
        startParams: { connector_id: 'giantswarm-ad' },
      });

      await connector.createSession({
        scopes: new Set(['openid']),
        instantPopup: true,
      });

      expect(memory.forget).not.toHaveBeenCalled();
      expect(memory.get()).toBe('giantswarm-ad');
    });

    it('forgets the connector on sign-out', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('', { status: 200 }));
      const memory = fakeMemory('giantswarm-ad');

      await createMainConnector({ memory }).removeSession();

      expect(String(fetchSpy.mock.calls[0][0])).toContain(
        '/oidc-gazelle/logout',
      );
      expect(memory.forget).toHaveBeenCalledTimes(1);
    });

    it('keeps the memory when the sign-out request fails', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response('', { status: 500, statusText: 'Server Error' }),
        );
      const memory = fakeMemory('giantswarm-ad');

      await expect(
        createMainConnector({ memory }).removeSession(),
      ).rejects.toThrow('Logout request failed');

      expect(memory.forget).not.toHaveBeenCalled();
    });

    it('records the pinned connector as a redirect-flow login starts', async () => {
      const redirectConfigApi = {
        getOptionalBoolean: jest.fn().mockReturnValue(true),
      } as unknown as ConfigApi;
      // jsdom reports the (unimplemented) navigation on the console.
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const memory = fakeMemory();
      const connector = createMainConnector({
        memory,
        configApi: redirectConfigApi,
        startParams: { connector_id: 'giantswarm-ad' },
      });

      // The redirect never resolves; wait for the navigation instead.
      connector.createSession({ scopes: new Set(['openid']) });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(openLoginPopup).not.toHaveBeenCalled();
      expect(memory.remember).toHaveBeenCalledWith('giantswarm-ad');
    });
  });
});
