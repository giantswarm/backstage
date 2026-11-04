import { connectorIconOf } from './connectorLogo';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';

describe('connectorIconOf', () => {
  it.each([
    PNG,
    SVG,
    'data:image/jpeg;base64,/9j/4AAQ',
    'data:image/webp;base64,UklGRg==',
  ])('accepts %s', icon => expect(connectorIconOf(icon)).toBe(icon));

  it('accepts an icon of exactly muster’s cap', () => {
    const prefix = 'data:image/png;base64,';
    const icon = `${prefix}${'A'.repeat(65_536 - prefix.length)}`;
    expect(connectorIconOf(icon)).toBe(icon);
  });

  it.each([
    ['a URL', 'https://example.com/icon.svg'],
    ['a non-image type', 'data:text/html;base64,PGgxPg=='],
    ['an unlisted image type', 'data:image/gif;base64,R0lGODlh'],
    ['a URL-encoded SVG', 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E'],
    ['a payload that is not base64', 'data:image/png;base64,<script>'],
    ['an oversized icon', `data:image/png;base64,${'A'.repeat(65_516)}`],
    ['a non-string', 42],
    ['nothing', undefined],
  ])('rejects %s', (_label, icon) => {
    expect(connectorIconOf(icon)).toBeUndefined();
  });
});
