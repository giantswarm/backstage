// This test reads the stylesheets from disk; nothing of them is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { dirname, join } from 'path';
import { render, screen } from '@testing-library/react';
import { Badge, Tag, TagGroup, Text } from '@backstage/ui';

const REM_PX = 16;

/**
 * The rules of a stylesheet without their cascade layers: jsdom applies no
 * rule inside one, and bui puts every rule in one. The overrides, unlayered,
 * come last, so the order decides as the layers do in a browser.
 */
function withoutLayers(css: string): string {
  let out = css.replace(/@layer[^{;]*;/g, '');
  for (;;) {
    const start = out.search(/@layer[^{;]*\{/);
    if (start < 0) return out;
    const open = out.indexOf('{', start);
    let depth = 1;
    let end = open + 1;
    for (; depth > 0; end++) {
      if (out[end] === '{') depth++;
      if (out[end] === '}') depth--;
    }
    out = out.slice(0, start) + out.slice(open + 1, end - 1) + out.slice(end);
  }
}

/** A custom property's value where an element is, inherited as in a browser. */
function customProperty(element: Element, name: string): string {
  for (let el: Element | null = element; el; el = el.parentElement) {
    const value = getComputedStyle(el).getPropertyValue(name).trim();
    if (value) return value;
  }
  return '';
}

/**
 * An element's font size in px. jsdom cascades the declarations but
 * substitutes no `var()` and inherits no custom property, so this does both.
 */
function fontSizePx(element: Element): number {
  let value = getComputedStyle(element).getPropertyValue('font-size').trim();
  for (let ref = value.match(/^var\((--[\w-]+)\)$/); ref;) {
    value = customProperty(element, ref[1]);
    ref = value.match(/^var\((--[\w-]+)\)$/);
  }
  const size = value.match(/^([\d.]+)(px|rem)$/);
  if (!size) throw new Error(`cannot resolve the font size "${value}"`);
  return Number(size[1]) * (size[2] === 'rem' ? REM_PX : 1);
}

/**
 * bui's stylesheet, its components' styles (injected when they render) and
 * the overrides, in the order the app loads them.
 */
function applyStylesheets() {
  const css = [
    // By the package's path: jest resolves a `.css` import to a stub.
    readFileSync(
      join(
        dirname(require.resolve('@backstage/ui/package.json')),
        'dist/css/styles.css',
      ),
      'utf8',
    ),
    ...Array.from(document.head.querySelectorAll('style'), s => s.textContent),
    readFileSync(join(__dirname, 'bui-overrides.css'), 'utf8'),
  ]
    .map(text => withoutLayers(text ?? ''))
    .join('\n');
  document.head.querySelectorAll('style').forEach(s => s.remove());
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

describe('bui-overrides.css text size', () => {
  // bui declares its tokens where a theme applies, the body in the app.
  beforeEach(() => document.body.setAttribute('data-theme-mode', 'light'));
  afterEach(() => document.body.removeAttribute('data-theme-mode'));

  it("sets bui's 10px pieces at 12px", () => {
    render(
      <>
        <Text variant="body-x-small">Harness</Text>
        <Badge size="small">Default</Badge>
        <TagGroup aria-label="Labels">
          <Tag size="small">team</Tag>
        </TagGroup>
        <Text variant="body-small">Caption</Text>
      </>,
    );
    applyStylesheets();

    expect(fontSizePx(screen.getByText('Harness'))).toBe(12);
    expect(fontSizePx(screen.getByText('Default'))).toBe(12);
    expect(fontSizePx(screen.getByRole('row', { name: 'team' }))).toBe(12);
    expect(fontSizePx(screen.getByText('Caption'))).toBe(12);
  });

  it('keeps 10px as the named exception', () => {
    render(<span>Mon</span>);
    applyStylesheets();

    expect(
      customProperty(screen.getByText('Mon'), '--gs-font-size-exception'),
    ).toBe('0.625rem');
  });
});
