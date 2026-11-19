// This helper reads bui's stylesheet from disk; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { dirname, join } from 'path';

const REM_PX = 16;

/**
 * A stylesheet's rules without their cascade layers: jsdom applies no rule
 * inside one, and bui puts every rule in one. Unlayered rules that come last
 * (the app's overrides) still win, as they do over layers in a browser.
 *
 * Comments are dropped first, so an `@layer` in one is no block. Throws on a
 * block whose braces do not close rather than reading past the end.
 */
export function withoutLayers(css: string): string {
  const source = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@layer[^{;]*;/g, '');
  let out = '';
  let from = 0;
  const layer = /@layer[^{;]*\{/g;
  for (let match = layer.exec(source); match; match = layer.exec(source)) {
    if (match.index < from) continue;
    let depth = 1;
    let end = match.index + match[0].length;
    for (; end < source.length && depth > 0; end++) {
      if (source[end] === '{') depth++;
      if (source[end] === '}') depth--;
    }
    if (depth > 0) {
      throw new Error(`unbalanced braces after "${match[0]}"`);
    }
    // The block's inside, its own nested layers unwrapped too.
    out +=
      source.slice(from, match.index) +
      withoutLayers(source.slice(match.index + match[0].length, end - 1));
    from = end;
    layer.lastIndex = end;
  }
  return out + source.slice(from);
}

/**
 * Applies bui's stylesheet, the component styles rendered so far (bui and
 * JSS inject theirs into the head) and `extraCss` after them, as the app
 * loads them, with their cascade layers unwrapped for jsdom. Call it after
 * rendering.
 */
export function applyBuiStylesheets(...extraCss: string[]) {
  const css = [
    // By the package's path: jest resolves a `.css` import to a stub.
    readFileSync(
      join(
        dirname(require.resolve('@backstage/ui/package.json')),
        'dist/css/styles.css',
      ),
      'utf8',
    ),
    ...Array.from(
      document.head.querySelectorAll('style'),
      s => s.textContent ?? '',
    ),
    ...extraCss,
  ]
    .map(withoutLayers)
    .join('\n');
  document.head.querySelectorAll('style').forEach(s => s.remove());
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
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
 * An element's font size in px, as a browser computes it from the
 * stylesheets applied. jsdom cascades the declarations but substitutes no
 * `var()` and inherits no custom property, so this does both. Throws when the
 * size does not resolve to px or rem, an undefined token among them.
 */
export function resolvedFontSize(element: Element): number {
  let value = getComputedStyle(element).getPropertyValue('font-size').trim();
  for (let hops = 0; hops < 10; hops++) {
    const ref = value.match(/^var\((--[\w-]+)\)$/);
    if (!ref) break;
    value = customProperty(element, ref[1]);
  }
  const size = value.match(/^([\d.]+)(px|rem)$/);
  if (!size) throw new Error(`cannot resolve the font size "${value}"`);
  return Number(size[1]) * (size[2] === 'rem' ? REM_PX : 1);
}
