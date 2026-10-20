/**
 * Test helper: the value a stylesheet or the inline style declares for an
 * element's CSS property, before the browser computes it.
 *
 * Since jsdom 30, `getComputedStyle` (and so `toHaveStyle`) returns computed
 * values, and it substitutes no `var()`: a declaration on a design token such
 * as `background: var(--bui-bg-neutral-3)` computes to the property's initial
 * value, so a test can no longer tell from it which token a component asked
 * for. This reads the declaration itself.
 *
 * ```ts
 * expect(declaredStyle(row, 'background')).toBe('var(--bui-bg-neutral-3)');
 * expect(declaredStyle(other, 'background')).toBe('');
 * ```
 *
 * The cascade is simplified: the inline style wins, then the last matching
 * rule in document order. Selector specificity and `!important` are not
 * weighed, a rule inside `@media` counts only while `window.matchMedia` says
 * its query matches, and a selector jsdom cannot match (`:hover`) never
 * matches. Returns `''` when nothing declares the property.
 *
 * No Jest APIs inside, so it ships from the package index and works in any
 * test runner.
 */
export function declaredStyle(element: HTMLElement, property: string): string {
  const inline = element.style.getPropertyValue(property);
  if (inline) {
    return inline;
  }
  let declared = '';
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        const value = rule.style.getPropertyValue(property);
        if (value && matches(element, rule.selectorText)) {
          declared = value;
        }
      } else if (rule instanceof CSSMediaRule) {
        if (window.matchMedia?.(rule.media.mediaText).matches) {
          visit(rule.cssRules);
        }
      }
    }
  };
  for (const sheet of Array.from(element.ownerDocument.styleSheets)) {
    visit(sheet.cssRules);
  }
  return declared;
}

function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    // A selector jsdom does not support cannot be checked; treat it as
    // not matching rather than failing the test.
    return false;
  }
}
