import { ConfigApi, OAuthRequestApi } from '@backstage/core-plugin-api';
import { openLoginPopup } from '@backstage/core-app-api';
import { GSAuthProviders } from './GSAuthProviders';
import { SIGN_IN_CONNECTOR_STORAGE_KEY } from './signInConnectorMemory';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';
import { InstallationConfig } from '../installations';

jest.mock('@backstage/core-app-api', () => ({
  ...jest.requireActual('@backstage/core-app-api'),
  openLoginPopup: jest.fn(),
}));

// Replace the module-level async installations source so the test drives what
// `ensureInitialized()` sees (and can make it reject on demand).
jest.mock('../installations', () => {
  const actual = jest.requireActual('../installations');
  return { ...actual, getInstallationsConfig: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getInstallationsConfig } = require('../installations') as {
  getInstallationsConfig: jest.Mock<Promise<InstallationConfig[]>>;
};

const configApi = {
  // No main provider, no broker: keeps getProviders returning exactly the
  // built per-installation providers, and avoids the broker filter.
  getOptionalString: jest.fn().mockReturnValue(undefined),
  getOptionalConfig: jest.fn().mockReturnValue(undefined),
  getOptionalStringArray: jest.fn().mockReturnValue(undefined),
  getString: jest.fn().mockReturnValue('http://backend'),
  getOptionalBoolean: jest.fn().mockReturnValue(false),
} as unknown as ConfigApi;

const oauthRequestApi: OAuthRequestApi = {
  createAuthRequester: jest.fn(() => jest.fn()),
  authRequest$: jest.fn(),
};

const discoveryApi = {
  getBaseUrl: jest.fn().mockResolvedValue('http://backend/api/auth'),
} as unknown as DiscoveryApiClient;

function createApi() {
  return GSAuthProviders.create({
    configApi,
    discoveryApi,
    oauthRequestApi,
  });
}

describe('GSAuthProviders.ensureInitialized', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    getInstallationsConfig.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('skips malformed installation entries and still builds the valid ones', async () => {
    getInstallationsConfig.mockResolvedValue([
      { name: 'valid', authProvider: 'oidc', oidcTokenProvider: 'oidc-valid' },
      // Non-oidc auth provider -> skipped.
      { name: 'bad-auth', authProvider: 'saml', oidcTokenProvider: 'oidc-x' },
      // Missing oidcTokenProvider -> skipped.
      { name: 'bad-missing', authProvider: 'oidc' },
      // oidcTokenProvider without the `oidc-` prefix -> skipped.
      { name: 'bad-prefix', authProvider: 'oidc', oidcTokenProvider: 'weird' },
    ]);

    const api = createApi();
    await api.ensureInitialized();

    const providerNames = api.getProviders().map(p => p.providerName);
    expect(providerNames).toEqual(['oidc-valid']);
    // One warning per skipped entry.
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it('does not latch a rejected promise: a later call retries and succeeds', async () => {
    getInstallationsConfig
      .mockRejectedValueOnce(new Error('installations source failed'))
      .mockResolvedValueOnce([
        {
          name: 'valid',
          authProvider: 'oidc',
          oidcTokenProvider: 'oidc-valid',
        },
      ]);

    const api = createApi();

    // First init rejects (transient failure).
    await expect(api.ensureInitialized()).rejects.toThrow(
      'installations source failed',
    );

    // A later call must NOT re-await the cached rejection -- it retries.
    await expect(api.ensureInitialized()).resolves.toBeUndefined();
    expect(getInstallationsConfig).toHaveBeenCalledTimes(2);
    expect(api.getProviders().map(p => p.providerName)).toEqual(['oidc-valid']);
  });
});

describe('GSAuthProviders.getFallbackSignInAuthApi', () => {
  function createApiWithConfig(values: Record<string, string | undefined>) {
    const scopedConfigApi = {
      ...configApi,
      getOptionalString: jest.fn((key: string) => values[key]),
    } as unknown as ConfigApi;
    return GSAuthProviders.create({
      configApi: scopedConfigApi,
      discoveryApi,
      oauthRequestApi,
    });
  }

  it('throws while no fallback connector is configured', () => {
    const api = createApiWithConfig({ 'gs.authProvider': 'oidc-gazelle' });

    expect(() => api.getFallbackSignInAuthApi()).toThrow(
      /gs.signInFallbackProvider.connectorId/,
    );
  });

  it('builds one pinned sign-in API next to the main one', () => {
    const api = createApiWithConfig({
      'gs.authProvider': 'oidc-gazelle',
      'gs.signInFallbackProvider.connectorId': 'giantswarm-ad',
    });

    const fallback = api.getFallbackSignInAuthApi();

    expect(fallback).toBeDefined();
    expect(fallback).not.toBe(api.getMainAuthApi());
    // memoized: the login page and its session pickup share one instance
    expect(api.getFallbackSignInAuthApi()).toBe(fallback);
  });
});

describe('GSAuthProviders sign-in connector memory', () => {
  const scope = 'openid profile email groups offline_access';
  // What the auth backend posts back to the opener once Dex has signed the
  // person in: the provider session plus the Backstage identity.
  const popupPayload = {
    providerInfo: {
      idToken: 'dex-id-token',
      accessToken: 'dex-access-token',
      scope,
      expiresInSeconds: 3600,
    },
    backstageIdentity: {
      token: 'backstage-token',
      identity: {
        type: 'user',
        userEntityRef: 'user:default/someone',
        ownershipEntityRefs: [],
      },
      expiresInSeconds: 3600,
    },
    profile: {},
  };

  // The person confirms the login dialog right away.
  const confirmingOauthRequestApi = {
    createAuthRequester: jest.fn(
      ({ onAuthRequest }: { onAuthRequest: (s: Set<string>) => unknown }) =>
        (scopes: Set<string>) =>
          onAuthRequest(scopes),
    ),
    authRequest$: jest.fn(),
  } as unknown as OAuthRequestApi;

  function createSignInApi(values: Record<string, string | undefined>) {
    const scopedConfigApi = {
      ...configApi,
      getOptionalString: jest.fn((key: string) => values[key]),
    } as unknown as ConfigApi;
    return GSAuthProviders.create({
      configApi: scopedConfigApi,
      discoveryApi,
      oauthRequestApi: confirmingOauthRequestApi,
    });
  }

  function popupQuery(call: number): URLSearchParams {
    const { url } = (openLoginPopup as jest.Mock).mock.calls[call][0];
    return new URL(url).searchParams;
  }

  function startPath(call: number): string {
    const { url } = (openLoginPopup as jest.Mock).mock.calls[call][0];
    return new URL(url).pathname;
  }

  beforeEach(() => {
    window.localStorage.clear();
    getInstallationsConfig.mockReset();
    (openLoginPopup as jest.Mock).mockReset();
    (openLoginPopup as jest.Mock).mockResolvedValue(popupPayload);
    // The refresh cookie is gone: every `/refresh` fails, sign-out succeeds.
    jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/refresh')) {
        return new Response('', { status: 401, statusText: 'Unauthorized' });
      }
      if (url.includes('/logout')) {
        return new Response('', { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('remembers a fallback-card sign-in and reuses it for the main API re-login popup', async () => {
    const api = createSignInApi({
      'gs.authProvider': 'oidc-gazelle',
      'gs.signInFallbackProvider.connectorId': 'giantswarm-ad',
    });

    // The login page's fallback card.
    const identity = await api
      .getFallbackSignInAuthApi()
      .getBackstageIdentity({ instantPopup: true });

    expect(identity?.token).toBe('backstage-token');
    expect(startPath(0)).toBe('/api/auth/oidc-gazelle/start');
    expect(popupQuery(0).get('connector_id')).toBe('giantswarm-ad');
    expect(window.localStorage.getItem(SIGN_IN_CONNECTOR_STORAGE_KEY)).toBe(
      'giantswarm-ad',
    );

    // Later, a plugin needs the Dex ID token from the main API, the refresh
    // token is gone, and the person confirms the login dialog.
    const idToken = await api.getMainAuthApi().getIdToken();

    expect(idToken).toBe('dex-id-token');
    expect(openLoginPopup).toHaveBeenCalledTimes(2);
    expect(startPath(1)).toBe('/api/auth/oidc-gazelle/start');
    expect(popupQuery(1).get('connector_id')).toBe('giantswarm-ad');
    expect(popupQuery(1).get('flow')).toBe('popup');
  });

  it('forgets the remembered connector when the main card is picked', async () => {
    window.localStorage.setItem(SIGN_IN_CONNECTOR_STORAGE_KEY, 'giantswarm-ad');
    const api = createSignInApi({
      'gs.authProvider': 'oidc-gazelle',
      'gs.signInFallbackProvider.connectorId': 'giantswarm-ad',
    });

    await api.getMainAuthApi().getBackstageIdentity({ instantPopup: true });

    expect(popupQuery(0).has('connector_id')).toBe(false);
    expect(
      window.localStorage.getItem(SIGN_IN_CONNECTOR_STORAGE_KEY),
    ).toBeNull();
  });

  it('forgets the remembered connector on sign-out', async () => {
    const api = createSignInApi({
      'gs.authProvider': 'oidc-gazelle',
      'gs.signInFallbackProvider.connectorId': 'giantswarm-ad',
    });
    const fallback = api.getFallbackSignInAuthApi();
    await fallback.getBackstageIdentity({ instantPopup: true });
    expect(window.localStorage.getItem(SIGN_IN_CONNECTOR_STORAGE_KEY)).toBe(
      'giantswarm-ad',
    );

    // SignInPage signs out through the API that signed in.
    await fallback.signOut();

    expect(
      window.localStorage.getItem(SIGN_IN_CONNECTOR_STORAGE_KEY),
    ).toBeNull();
  });

  it('keeps per-installation providers out of it', async () => {
    window.localStorage.setItem(SIGN_IN_CONNECTOR_STORAGE_KEY, 'giantswarm-ad');
    getInstallationsConfig.mockResolvedValue([
      { name: 'golem', authProvider: 'oidc', oidcTokenProvider: 'oidc-golem' },
    ]);
    const api = createSignInApi({ 'gs.authProvider': 'oidc-gazelle' });

    // No broker configured: the installation signs in through its own popup.
    const golem = await api.getKubernetesAuthApi('oidc-golem');
    await golem!.getIdToken();

    expect(startPath(0)).toBe('/api/auth/oidc-golem/start');
    expect(popupQuery(0).has('connector_id')).toBe(false);
    expect(window.localStorage.getItem(SIGN_IN_CONNECTOR_STORAGE_KEY)).toBe(
      'giantswarm-ad',
    );
  });
});
