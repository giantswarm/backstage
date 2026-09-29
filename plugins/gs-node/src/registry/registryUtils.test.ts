import { findLatestStableVersion, getNextPageUrl } from './registryUtils';

describe('findLatestStableVersion', () => {
  it('skips release candidates and dev builds', () => {
    expect(
      findLatestStableVersion([
        '1.3.1-r08a93c50t20260127094959h1a2b3c4',
        '1.3.0-rc.1',
        '1.2.0',
        '1.1.0',
      ]),
    ).toBe('1.2.0');
  });

  it('falls back to the newest version when none is stable', () => {
    expect(findLatestStableVersion(['1.3.0-rc.2', '1.3.0-rc.1'])).toBe(
      '1.3.0-rc.2',
    );
  });

  it('returns null for no versions', () => {
    expect(findLatestStableVersion([])).toBeNull();
  });
});

describe('getNextPageUrl', () => {
  function withLink(link: string | null) {
    return { headers: { get: () => link } };
  }

  it('resolves a relative next link against the current URL', () => {
    expect(
      getNextPageUrl(
        withLink(
          '</acr/v1/charts/my-app/_tags?last=1%262.71.7&n=100&orderby=timedesc>; rel="next"',
        ),
        'https://gsoci.azurecr.io/acr/v1/charts/my-app/_tags?orderby=timedesc',
      ),
    ).toBe(
      'https://gsoci.azurecr.io/acr/v1/charts/my-app/_tags?last=1%262.71.7&n=100&orderby=timedesc',
    );
  });

  it('keeps an absolute next link', () => {
    expect(
      getNextPageUrl(
        withLink('<https://ghcr.io/v2/org/app/tags/list?last=b>; rel=next'),
        'https://ghcr.io/v2/org/app/tags/list',
      ),
    ).toBe('https://ghcr.io/v2/org/app/tags/list?last=b');
  });

  it('ignores links that are not the next page', () => {
    expect(
      getNextPageUrl(
        withLink('</v2/org/app/tags/list?last=a>; rel="prev"'),
        'https://ghcr.io/v2/org/app/tags/list',
      ),
    ).toBeUndefined();
    expect(
      getNextPageUrl(withLink(null), 'https://ghcr.io/v2/org/app/tags/list'),
    ).toBeUndefined();
  });
});
