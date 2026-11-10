import { describeExternalUrl } from './describeExternalUrl';

describe('describeExternalUrl', () => {
  it('highlights the registrable domain, not the subdomain', () => {
    const described = describeExternalUrl(
      'https://login.github.com.evil.co.uk/oauth?state=1',
    );

    expect(described).toMatchObject({
      domain: 'evil.co.uk',
      before: 'https://login.github.com.',
      after: '/oauth?state=1',
      warnings: [],
    });
  });

  it('keeps a private suffix owner as the domain', () => {
    expect(describeExternalUrl('https://a.team.github.io/')?.domain).toBe(
      'team.github.io',
    );
  });

  it('highlights the whole host when it has no registrable domain', () => {
    expect(describeExternalUrl('http://127.0.0.1:8080/cb')).toMatchObject({
      domain: '127.0.0.1',
      before: 'http://',
      after: ':8080/cb',
      warnings: [],
    });
  });

  it('shows an internationalized host as punycode and warns', () => {
    const described = describeExternalUrl('https://аpple.com/sign-in');

    expect(described?.href).toBe('https://xn--pple-43d.com/sign-in');
    expect(described?.domain).toBe('xn--pple-43d.com');
    expect(described?.warnings).toEqual(['punycode']);
  });

  it('warns on plain http to another machine and on user info', () => {
    expect(
      describeExternalUrl('http://github.com@evil.example/')?.warnings,
    ).toEqual(['insecure', 'userinfo']);
  });

  it('finds the host after user info that repeats it', () => {
    expect(
      describeExternalUrl('https://evil.example@evil.example/x'),
    ).toMatchObject({
      before: 'https://evil.example@',
      domain: 'evil.example',
      after: '/x',
    });
  });

  it('highlights the whole host when it ends in a dot', () => {
    expect(describeExternalUrl('https://ab.evil.com./x')).toMatchObject({
      before: 'https://',
      domain: 'ab.evil.com.',
      after: '/x',
    });
  });

  it.each([
    'https://login.github.com.evil.co.uk/oauth?state=1',
    'https://ab.evil.com./x',
    'https://user:pw@evil.example:8443/x#y',
    'http://[::1]:8080/cb',
    'https://аpple.com/sign-in',
  ])('shows exactly the address it opens: %s', raw => {
    const described = describeExternalUrl(raw)!;
    expect(described.before + described.domain + described.after).toBe(
      described.href,
    );
  });

  it.each([
    // eslint-disable-next-line no-script-url
    'javascript:alert(1)',
    'data:text/html,hi',
    'not a url',
    '/relative',
  ])('refuses %s', raw => {
    expect(describeExternalUrl(raw)).toBeUndefined();
  });
});
