import { isValidDNSSubdomainName } from './isValidDNSSubdomainName';

describe('isValidDNSSubdomainName', () => {
  it.each([
    'a',
    'my-config',
    'my.config',
    'abc-123.def',
    'a1',
    '1a',
    'a'.repeat(253),
  ])('accepts valid name: %s', name => {
    expect(isValidDNSSubdomainName(name)).toBe(true);
  });

  it.each([
    ['empty string', ''],
    ['uppercase letters', 'My-Config'],
    ['starts with hyphen', '-my-config'],
    ['ends with hyphen', 'my-config-'],
    ['starts with dot', '.my-config'],
    ['ends with dot', 'my-config.'],
    ['contains underscore', 'my_config'],
    ['contains space', 'my config'],
    ['exceeds 253 characters', 'a'.repeat(254)],
    ['contains special characters', 'my@config'],
  ])('rejects invalid name: %s', (_label, name) => {
    expect(isValidDNSSubdomainName(name)).toBe(false);
  });
});
