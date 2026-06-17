import { ConfigApi, OAuthRequestApi } from '@backstage/core-plugin-api';
import { ClusterTokenError, DefaultAuthConnector } from './DefaultAuthConnector';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';

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
});
