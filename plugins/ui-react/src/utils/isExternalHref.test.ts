import { isExternalHref } from './isExternalHref';

const ORIGIN = 'https://portal.example.io';

describe('isExternalHref', () => {
  it('counts an http(s) URL on another origin as external', () => {
    expect(isExternalHref('https://github.com/example-org/api', ORIGIN)).toBe(
      true,
    );
    expect(isExternalHref('http://docs.example.com/a', ORIGIN)).toBe(true);
    expect(isExternalHref('//cdn.example.com/x', ORIGIN)).toBe(true);
  });

  it('keeps the portal’s own links, fragments and other schemes inside', () => {
    expect(isExternalHref(`${ORIGIN}/catalog`, ORIGIN)).toBe(false);
    expect(isExternalHref('/customize/skills', ORIGIN)).toBe(false);
    expect(isExternalHref('settings', ORIGIN)).toBe(false);
    expect(isExternalHref('#setup', ORIGIN)).toBe(false);
    expect(isExternalHref('mailto:team@example.com', ORIGIN)).toBe(false);
  });
});
