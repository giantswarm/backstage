import { OAuthApi, OpenIdConnectApi } from '@backstage/core-plugin-api';
import { MusterAuthProviders } from './MusterAuthProviders';

const oauthApi = (token: string): OAuthApi => ({
  getAccessToken: jest.fn().mockResolvedValue(token),
});

const oidcApi = (idToken: string): OpenIdConnectApi => ({
  getIdToken: jest.fn().mockResolvedValue(idToken),
});

describe('MusterAuthProviders', () => {
  it('returns the access token from a dedicated provider', async () => {
    const providers = new MusterAuthProviders({
      'mcp-muster': oauthApi('access-token'),
    });

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({
      token: 'access-token',
    });
  });

  it('falls back to the main auth ID token for unknown providers', async () => {
    const providers = new MusterAuthProviders({}, oidcApi('main-id-token'));

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({
      token: 'main-id-token',
    });
  });

  it('prefers a dedicated provider over the main auth fallback', async () => {
    const main = oidcApi('main-id-token');
    const providers = new MusterAuthProviders(
      { 'mcp-muster': oauthApi('access-token') },
      main,
    );

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({
      token: 'access-token',
    });
    expect(main.getIdToken).not.toHaveBeenCalled();
  });

  it('returns empty credentials without a matching provider or main auth', async () => {
    const providers = new MusterAuthProviders();

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({});
  });

  it('returns empty credentials when the main auth fallback fails', async () => {
    const providers = new MusterAuthProviders(
      {},
      { getIdToken: jest.fn().mockRejectedValue(new Error('boom')) },
    );

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({});
  });
});
