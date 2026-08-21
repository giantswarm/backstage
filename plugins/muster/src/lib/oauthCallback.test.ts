import { musterOAuthCallbackUrl } from './oauthCallback';

describe('musterOAuthCallbackUrl', () => {
  it('replaces the /mcp suffix of the aggregator endpoint', () => {
    expect(
      musterOAuthCallbackUrl('https://muster.gazelle.example.com/mcp'),
    ).toBe('https://muster.gazelle.example.com/oauth/callback');
  });

  it('keeps a base path in front of /mcp', () => {
    expect(musterOAuthCallbackUrl('https://mc.example.com/muster/mcp')).toBe(
      'https://mc.example.com/muster/oauth/callback',
    );
  });

  it('tolerates a trailing slash and an endpoint without /mcp', () => {
    expect(musterOAuthCallbackUrl('https://muster.example.com/mcp/')).toBe(
      'https://muster.example.com/oauth/callback',
    );
    expect(musterOAuthCallbackUrl('https://muster.example.com')).toBe(
      'https://muster.example.com/oauth/callback',
    );
  });

  it('returns undefined without an endpoint or for a malformed one', () => {
    expect(musterOAuthCallbackUrl(undefined)).toBeUndefined();
    expect(musterOAuthCallbackUrl('not a url')).toBeUndefined();
  });
});
