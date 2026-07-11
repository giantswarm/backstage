import { OAuthApi, OpenIdConnectApi } from '@backstage/core-plugin-api';
import { MCPAuthProviders } from './MCPAuthProviders';

const oauthApi = (token: string): OAuthApi => ({
  getAccessToken: jest.fn().mockResolvedValue(token),
});

const oidcApi = (idToken: string): OpenIdConnectApi => ({
  getIdToken: jest.fn().mockResolvedValue(idToken),
});

describe('MCPAuthProviders', () => {
  it('returns the access token from a dedicated provider', async () => {
    const providers = new MCPAuthProviders({
      'mcp-muster': oauthApi('access-token'),
    });

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({
      token: 'access-token',
    });
  });

  it('falls back to the main auth ID token for unknown providers', async () => {
    const providers = new MCPAuthProviders({}, oidcApi('main-id-token'));

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({
      token: 'main-id-token',
    });
  });

  it('prefers a dedicated provider over the main auth fallback', async () => {
    const main = oidcApi('main-id-token');
    const providers = new MCPAuthProviders(
      { 'mcp-muster': oauthApi('access-token') },
      main,
    );

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({
      token: 'access-token',
    });
    expect(main.getIdToken).not.toHaveBeenCalled();
  });

  it('returns empty credentials without a matching provider or main auth', async () => {
    const providers = new MCPAuthProviders();

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({});
  });

  it('returns empty credentials when the dedicated provider fails', async () => {
    const providers = new MCPAuthProviders({
      'mcp-muster': {
        getAccessToken: jest.fn().mockRejectedValue(new Error('boom')),
      },
    });

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({});
  });

  it('returns empty credentials when the main auth fallback fails', async () => {
    const providers = new MCPAuthProviders(
      {},
      { getIdToken: jest.fn().mockRejectedValue(new Error('boom')) },
    );

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({});
  });

  it('mints a muster token instead of forwarding the raw ID token when configured', async () => {
    const main = oidcApi('main-id-token');
    const musterTokenProvider = jest.fn().mockResolvedValue('muster-token');
    const providers = new MCPAuthProviders({}, main, musterTokenProvider);

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({
      token: 'muster-token',
    });
    // The raw main ID token must not be forwarded once minting is configured.
    expect(main.getIdToken).not.toHaveBeenCalled();
  });

  it('fails closed when minting fails, without falling back to the raw ID token', async () => {
    const main = oidcApi('main-id-token');
    const musterTokenProvider = jest.fn().mockRejectedValue(new Error('boom'));
    const providers = new MCPAuthProviders({}, main, musterTokenProvider);

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({});
    expect(main.getIdToken).not.toHaveBeenCalled();
  });

  it('fails closed when minting yields no token', async () => {
    const main = oidcApi('main-id-token');
    const musterTokenProvider = jest.fn().mockResolvedValue(undefined);
    const providers = new MCPAuthProviders({}, main, musterTokenProvider);

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({});
  });

  it('still prefers a dedicated provider over minting', async () => {
    const musterTokenProvider = jest.fn().mockResolvedValue('muster-token');
    const providers = new MCPAuthProviders(
      { 'mcp-muster': oauthApi('access-token') },
      undefined,
      musterTokenProvider,
    );

    await expect(providers.getCredentials('mcp-muster')).resolves.toEqual({
      token: 'access-token',
    });
    expect(musterTokenProvider).not.toHaveBeenCalled();
  });
});
