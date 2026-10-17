import { ConfigApi, OAuthRequestApi } from '@backstage/core-plugin-api';
import { openLoginPopup } from '@backstage/core-app-api';
import { GSAuthProviders } from './GSAuthProviders';
import { SIGN_IN_CONNECTOR_STORAGE_KEY } from './signInConnectorMemory';
import { LOGIN_REQUESTED_BY_ATTRIBUTE } from './loginRequestCaller';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';
import { InstallationConfig } from '../installations';
import { ClusterAccessStatusApi } from '../clusterAccessStatus';
import { Config, ConfigReader } from '@backstage/config';

jest.mock('@backstage/core-app-api', () => ({
  ...jest.requireActual('@backstage/core-app-api'),
  openLoginPopup: jest.fn(),
}));

// Replace the module-level signed-in config source so the test drives what
// `ensureInitialized()` sees (and can make it reject on demand).
jest.mock('@giantswarm/backstage-plugin-gs-react', () => {
  const actual = jest.requireActual('@giantswarm/backstage-plugin-gs-react');
  return { ...actual, getSignedInConfig: jest.fn() };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getSignedInConfig } =
  require('@giantswarm/backstage-plugin-gs-react') as {
    getSignedInConfig: jest.Mock<Promise<Config>>;
  };

/** A signed-in config that carries exactly these installations. */
function signedInConfig(installations: InstallationConfig[]): Config {
  return new ConfigReader({
    gs: {
      installations: Object.fromEntries(
        installations.map(({ name, ...rest }) => [name, rest]),
      ),
    },
  });
}

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
    getSignedInConfig.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('skips malformed installation entries and still builds the valid ones', async () => {
    getSignedInConfig.mockResolvedValue(
      signedInConfig([
        {
          name: 'valid',
          authProvider: 'oidc',
          oidcTokenProvider: 'oidc-valid',
        },
        // Non-oidc auth provider -> skipped.
        { name: 'bad-auth', authProvider: 'saml', oidcTokenProvider: 'oidc-x' },
        // Missing oidcTokenProvider -> skipped.
        { name: 'bad-missing', authProvider: 'oidc' },
        // oidcTokenProvider without the `oidc-` prefix -> skipped.
        {
          name: 'bad-prefix',
          authProvider: 'oidc',
          oidcTokenProvider: 'weird',
        },
      ]),
    );

    const api = createApi();
    await api.ensureInitialized();

    const providerNames = api.getProviders().map(p => p.providerName);
    expect(providerNames).toEqual(['oidc-valid']);
    // One warning per skipped entry.
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });

  it('does not latch a rejected promise: a later call retries and succeeds', async () => {
    getSignedInConfig
      .mockRejectedValueOnce(new Error('signed-in config source failed'))
      .mockResolvedValueOnce(
        signedInConfig([
          {
            name: 'valid',
            authProvider: 'oidc',
            oidcTokenProvider: 'oidc-valid',
          },
        ]),
      );

    const api = createApi();

    // First init rejects (transient failure).
    await expect(api.ensureInitialized()).rejects.toThrow(
      'signed-in config source failed',
    );

    // A later call must NOT re-await the cached rejection -- it retries.
    await expect(api.ensureInitialized()).resolves.toBeUndefined();
    expect(getSignedInConfig).toHaveBeenCalledTimes(2);
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
    getSignedInConfig.mockReset();
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
    getSignedInConfig.mockResolvedValue(
      signedInConfig([
        {
          name: 'golem',
          authProvider: 'oidc',
          oidcTokenProvider: 'oidc-golem',
        },
      ]),
    );
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

describe('GSAuthProviders.getGithubAuthApi', () => {
  function createApiWithConfig(values: Record<string, string | undefined>) {
    const scopedConfigApi = {
      ...configApi,
      getOptionalString: jest.fn((key: string) => values[key]),
      getString: jest.fn((key: string) => {
        if (key === 'backend.baseUrl') {
          return 'http://backend';
        }
        throw new Error(`unexpected getString(${key})`);
      }),
    } as unknown as ConfigApi;
    return GSAuthProviders.create({
      configApi: scopedConfigApi,
      discoveryApi,
      oauthRequestApi,
    });
  }

  it('is off without gs.github, so the app keeps the upstream GitHub provider', () => {
    const api = createApiWithConfig({ 'gs.authProvider': 'oidc-gazelle' });
    expect(api.hasGithubAuthApi()).toBe(false);
    expect(api.getGithubAuthApi()).toBeUndefined();
  });

  it('is off without a main login provider (nothing to exchange)', () => {
    const api = createApiWithConfig({ 'gs.github.brokerAudience': 'github' });
    expect(api.hasGithubAuthApi()).toBe(false);
    expect(api.getGithubAuthApi()).toBeUndefined();
  });

  it('builds one GitHub auth API on the grant when gs.github is configured', () => {
    const api = createApiWithConfig({
      'gs.authProvider': 'oidc-gazelle',
      'gs.github.brokerAudience': 'github',
    });
    expect(api.hasGithubAuthApi()).toBe(true);
    const github = api.getGithubAuthApi();
    expect(github).toBeDefined();
    expect(github).not.toBe(api.getMainAuthApi());
    // memoized: ScmAuth, the settings card and the plugins share one session
    expect(api.getGithubAuthApi()).toBe(github);
  });
});

describe('GSAuthProviders cluster token broker coverage', () => {
  const installations = {
    a: { authProvider: 'oidc', oidcTokenProvider: 'oidc-a' },
    b: { authProvider: 'oidc', oidcTokenProvider: 'oidc-b' },
    c: {
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-c',
      clusterTokenAudience: 'c',
    },
  };

  function createCoverageApi(clusterTokenBroker: object | undefined) {
    getSignedInConfig.mockResolvedValue(
      new ConfigReader({ gs: { installations, clusterTokenBroker } }),
    );
    return GSAuthProviders.create({
      configApi: {
        ...configApi,
        getOptionalString: jest.fn((key: string) =>
          key === 'gs.authProvider' ? 'oidc-a' : undefined,
        ),
      } as unknown as ConfigApi,
      discoveryApi,
      oauthRequestApi,
    });
  }

  beforeEach(() => {
    getSignedInConfig.mockReset();
  });

  it('covers only the Dex targets when there is no muster broker', async () => {
    const api = createCoverageApi({ targets: { b: {} } });
    await api.ensureInitialized();

    expect(api.getBrokerCoveredInstallations()).toEqual(['b']);
    // clusterTokenAudience alone means nothing without muster: c keeps its
    // own provider entry, b's leaves the settings page.
    expect(api.getProviders().map(p => p.providerName)).toEqual([
      'oidc-a',
      'oidc-c',
    ]);
  });

  it('covers the Dex targets and muster-covered installations together', async () => {
    const api = createCoverageApi({
      tokenUrl: 'https://muster.example.com/oauth/token',
      targets: { b: {} },
    });
    await api.ensureInitialized();

    expect(api.getBrokerCoveredInstallations()).toEqual(['b', 'c']);
    expect(api.getProviders().map(p => p.providerName)).toEqual(['oidc-a']);
  });

  it('exchanges at muster only for the installations it covers', async () => {
    const api = createCoverageApi({
      tokenUrl: 'https://muster.example.com/oauth/token',
    });
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async input => {
        const url = String(input);
        if (url.includes('/oidc-a/refresh')) {
          return new Response(
            JSON.stringify({
              providerInfo: {
                idToken: 'main-id-token',
                accessToken: 'main-access-token',
                scope: 'openid',
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
            }),
          );
        }
        if (url.includes('/api/auth/cluster-token/')) {
          return new Response(
            JSON.stringify({ token: 'cluster-token', expiresInSeconds: 600 }),
          );
        }
        return new Response('', { status: 401 });
      });

    try {
      const covered = await api.getKubernetesAuthApi('oidc-c');
      await expect(covered!.getIdToken({ optional: true })).resolves.toBe(
        'cluster-token',
      );

      // b is not marked covered: muster would only answer invalid_target, so
      // it is never asked. b keeps its own sign-in, which has no session here.
      const uncovered = await api.getKubernetesAuthApi('oidc-b');
      await expect(uncovered!.getIdToken({ optional: true })).resolves.toBe('');

      const exchanged = fetchSpy.mock.calls
        .map(([input]) => String(input))
        .filter(url => url.includes('/api/auth/cluster-token/'));
      expect(exchanged).toEqual(['http://backend/api/auth/cluster-token/c']);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('covers nothing without a broker', async () => {
    const api = createCoverageApi(undefined);
    await api.ensureInitialized();

    expect(api.getBrokerCoveredInstallations()).toEqual([]);
    expect(api.getProviders().map(p => p.providerName)).toEqual([
      'oidc-a',
      'oidc-b',
      'oidc-c',
    ]);
  });
});

describe('GSAuthProviders cluster-token mint', () => {
  const installations = {
    a: { authProvider: 'oidc', oidcTokenProvider: 'oidc-a' },
    b: {
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-b',
      clusterTokenAudience: 'b',
    },
    c: {
      authProvider: 'oidc',
      oidcTokenProvider: 'oidc-c',
      clusterTokenAudience: 'c',
    },
  };

  const mainSession = {
    providerInfo: {
      idToken: 'main-id-token',
      accessToken: 'main-access-token',
      scope: 'openid',
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

  // The main sign-in (Login Required): every prompt is recorded, and the
  // person declines it.
  let signInPrompts: jest.Mock;
  // What `data-login-requested-by` named at each prompt.
  let requestedBy: (string | null)[];
  let fetchSpy: jest.SpyInstance;

  function createMintApi(options: {
    sessionAlive: boolean;
    hasUserGesture: () => boolean;
  }) {
    getSignedInConfig.mockResolvedValue(
      new ConfigReader({
        gs: {
          installations,
          clusterTokenBroker: {
            tokenUrl: 'https://muster.example.com/oauth/token',
          },
        },
      }),
    );
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async input => {
      const url = String(input);
      if (url.includes('/oidc-a/refresh')) {
        return options.sessionAlive
          ? new Response(JSON.stringify(mainSession))
          : new Response('', { status: 401, statusText: 'Unauthorized' });
      }
      if (url.includes('/api/auth/cluster-token/')) {
        return new Response(
          JSON.stringify({ token: 'cluster-token', expiresInSeconds: 600 }),
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    const statusApi = {
      recordSessionExpired: jest.fn(),
      recordDegraded: jest.fn(),
    };
    const api = GSAuthProviders.create({
      configApi: {
        ...configApi,
        getOptionalString: jest.fn((key: string) =>
          key === 'gs.authProvider' ? 'oidc-a' : undefined,
        ),
      } as unknown as ConfigApi,
      discoveryApi,
      oauthRequestApi: {
        createAuthRequester: jest.fn(() => signInPrompts),
        authRequest$: jest.fn(),
      },
      clusterAccessStatusApi: statusApi as unknown as ClusterAccessStatusApi,
      hasUserGesture: options.hasUserGesture,
    });
    return { api, statusApi };
  }

  function clusterTokenRequests(): string[] {
    return fetchSpy.mock.calls
      .map(([input]) => String(input))
      .filter(url => url.includes('/api/auth/cluster-token/'));
  }

  beforeEach(() => {
    getSignedInConfig.mockReset();
    requestedBy = [];
    signInPrompts = jest.fn(async () => {
      requestedBy.push(
        document.body.getAttribute(LOGIN_REQUESTED_BY_ATTRIBUTE),
      );
      throw new Error('Login failed');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ends a background mint after the session is gone without a sign-in prompt', async () => {
    const { api, statusApi } = createMintApi({
      sessionAlive: false,
      hasUserGesture: () => false,
    });

    // Every covered installation, read the way a poll reads it (optional) and
    // the way a probe reads it (not optional): none opens the sign-in.
    for (const providerName of ['oidc-b', 'oidc-c']) {
      const clusterApi = await api.getKubernetesAuthApi(providerName);
      await expect(clusterApi!.getIdToken({ optional: true })).resolves.toBe(
        '',
      );
      await expect(clusterApi!.getIdToken()).rejects.toMatchObject({
        name: 'ClusterTokenError',
        reason: 'session-expired',
      });
    }

    expect(signInPrompts).not.toHaveBeenCalled();
    expect(clusterTokenRequests()).toEqual([]);
    expect(statusApi.recordSessionExpired).toHaveBeenCalledWith(
      'b',
      'Your session expired -- sign in again',
    );
    expect(statusApi.recordSessionExpired).toHaveBeenCalledWith(
      'c',
      'Your session expired -- sign in again',
    );
  });

  it('opens the sign-in for a read a person starts after the session is gone', async () => {
    const { api, statusApi } = createMintApi({
      sessionAlive: false,
      hasUserGesture: () => true,
    });

    const clusterApi = await api.getKubernetesAuthApi('oidc-b');
    await expect(clusterApi!.getIdToken()).rejects.toMatchObject({
      name: 'ClusterTokenError',
      reason: 'session-expired',
    });

    expect(signInPrompts).toHaveBeenCalled();
    // Every sign-in it opens is named as the mint’s while it is open.
    expect(new Set(requestedBy)).toEqual(new Set(['cluster-token-mint']));
    expect(document.body.hasAttribute(LOGIN_REQUESTED_BY_ATTRIBUTE)).toBe(
      false,
    );
    expect(clusterTokenRequests()).toEqual([]);
    expect(statusApi.recordSessionExpired).toHaveBeenCalledWith(
      'b',
      'Your session expired -- sign in again',
    );
  });

  it('mints silently in the background while the session is alive', async () => {
    const { api } = createMintApi({
      sessionAlive: true,
      hasUserGesture: () => false,
    });

    const b = await api.getKubernetesAuthApi('oidc-b');
    const c = await api.getKubernetesAuthApi('oidc-c');
    await expect(b!.getIdToken()).resolves.toBe('cluster-token');
    await expect(c!.getIdToken({ optional: true })).resolves.toBe(
      'cluster-token',
    );

    expect(signInPrompts).not.toHaveBeenCalled();
    expect(clusterTokenRequests()).toEqual([
      'http://backend/api/auth/cluster-token/b',
      'http://backend/api/auth/cluster-token/c',
    ]);
  });
});
