/**
 * Test helper: the heights `useCollapsible` measures, which jsdom never lays
 * out (every `offsetHeight` is 0, so nothing would ever be cut).
 *
 * The cut's limit box resolves its CSS height — `'10lh'` to ten lines of
 * {@link MockCollapsibleLayoutOptions.lineHeight}, `'250px'` to 250 — and the
 * content lays out as one line per line of its text, unless the test says
 * otherwise.
 *
 * ```ts
 * let layout: MockedCollapsibleLayout;
 * beforeEach(() => { layout = mockCollapsibleLayout(); });
 * afterEach(() => layout.restore());
 * ```
 *
 * Install it before rendering: the heights are read when the component
 * mounts. No Jest APIs inside, so it ships from the package index and works in
 * any test runner.
 */

export type MockCollapsibleLayoutOptions = {
  /** What one `lh`, and one line of text, measures in px. */
  lineHeight?: number;
  /**
   * How tall the content lays out, in px: a number for every collapsible, or
   * a function of the content element. One line per line of its text when
   * absent.
   */
  contentHeight?: number | ((content: HTMLElement) => number);
};

export type MockedCollapsibleLayout = {
  /** Put back jsdom's `offsetHeight`. */
  restore(): void;
};

const DEFAULT_LINE_HEIGHT = 20;

function resolveLength(length: string, lineHeight: number): number {
  const value = parseFloat(length);
  if (Number.isNaN(value)) {
    return 0;
  }
  return length.trim().endsWith('lh') ? value * lineHeight : value;
}

export function mockCollapsibleLayout({
  lineHeight = DEFAULT_LINE_HEIGHT,
  contentHeight,
}: MockCollapsibleLayoutOptions = {}): MockedCollapsibleLayout {
  const original = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );

  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.hasAttribute('data-collapsible-limit')) {
        return resolveLength(this.style.height, lineHeight);
      }
      if (this.hasAttribute('data-collapsible-content')) {
        if (typeof contentHeight === 'number') {
          return contentHeight;
        }
        if (contentHeight) {
          return contentHeight(this);
        }
        return (this.textContent ?? '').split('\n').length * lineHeight;
      }
      return original?.get?.call(this) ?? 0;
    },
  });

  return {
    restore() {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original);
      }
    },
  };
}
