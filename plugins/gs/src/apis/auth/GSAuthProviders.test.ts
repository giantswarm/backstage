import { ConfigApi, OAuthRequestApi } from '@backstage/core-plugin-api';
import { GSAuthProviders } from './GSAuthProviders';
import { DiscoveryApiClient } from '../discovery/DiscoveryApiClient';
import { InstallationConfig } from '../installations';

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
