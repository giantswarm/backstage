import { isWebURL, safeWebURL } from './webURL';

describe('safeWebURL', () => {
  it('keeps absolute http(s) addresses', () => {
    expect(safeWebURL('https://github.com/o/r/pull/1')).toBe(
      'https://github.com/o/r/pull/1',
    );
    expect(safeWebURL(' http://ci.example/job/2 ')).toBe(
      'http://ci.example/job/2',
    );
  });

  it('drops every other scheme, relative paths and non-URLs', () => {
    // eslint-disable-next-line no-script-url
    expect(safeWebURL('javascript:alert(1)')).toBeUndefined();
    expect(safeWebURL('data:text/html,x')).toBeUndefined();
    expect(safeWebURL('/customize')).toBeUndefined();
    expect(safeWebURL('not a url')).toBeUndefined();
    expect(safeWebURL('')).toBeUndefined();
    expect(safeWebURL(undefined)).toBeUndefined();
  });
});

describe('isWebURL', () => {
  it('needs http(s) and a host', () => {
    expect(isWebURL(new URL('https://example.com'))).toBe(true);
    expect(isWebURL(new URL('file:///etc/passwd'))).toBe(false);
    expect(isWebURL(new URL('mailto:a@example.com'))).toBe(false);
  });
});
