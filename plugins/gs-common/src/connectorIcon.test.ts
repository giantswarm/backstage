import { connectorIconOf, serverInfoIconOf } from './connectorIcon';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const SVG = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
/** A script URL, built so the source carries no `javascript:` literal. */
const SCRIPT_URL = ['javascript', 'alert(1)'].join(':');

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
    ['a javascript: URI', SCRIPT_URL],
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

describe('serverInfoIconOf', () => {
  it('picks the icon muster announces in its initialize result', () => {
    expect(
      serverInfoIconOf({
        name: 'muster',
        version: '5.59.0',
        icons: [{ src: SVG, mimeType: 'image/svg+xml', sizes: ['any'] }],
      }),
    ).toBe(SVG);
  });

  it('skips icons it would not render for the first it would', () => {
    expect(
      serverInfoIconOf({
        icons: [
          { src: SCRIPT_URL },
          { src: 'data:text/html;base64,PGgxPg==' },
          { src: 'https://example.com/icon.svg' },
          'not an icon',
          { src: PNG },
        ],
      }),
    ).toBe(PNG);
  });

  it('prefers an icon without a theme, which reads on either', () => {
    expect(
      serverInfoIconOf({
        icons: [
          { src: PNG, theme: 'dark' },
          { src: SVG, sizes: ['any'] },
        ],
      }),
    ).toBe(SVG);
  });

  it('falls back to the first themed icon when every icon has one', () => {
    expect(
      serverInfoIconOf({
        icons: [
          { src: PNG, theme: 'light' },
          { src: SVG, theme: 'dark' },
        ],
      }),
    ).toBe(PNG);
  });

  it.each([
    ['no icons (a muster before v5.59.0)', { name: 'muster', version: '1' }],
    ['only unusable icons', { icons: [{ src: SCRIPT_URL }] }],
    ['icons that are not a list', { icons: { src: SVG } }],
    ['no serverInfo', undefined],
  ])('answers none for %s', (_label, serverInfo) => {
    expect(serverInfoIconOf(serverInfo)).toBeUndefined();
  });
});
