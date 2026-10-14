/**
 * Test helpers: a `window.matchMedia` that answers for a chosen viewport.
 *
 * jsdom implements no `matchMedia`, so without one every media hook answers
 * `false` and only the desktop branch of a component is ever tested. These
 * install a fake that evaluates the queries the portal uses — `min-width` /
 * `max-width` in px, `hover`, `pointer`, joined with `and`, alternatives with
 * commas — against a simulated viewport, and notifies listeners when the
 * viewport changes. MUI's `useMediaQuery` reads `window.matchMedia` too, so it
 * agrees with `usePhoneLayout`.
 *
 * ```ts
 * let layout: MockedLayout;
 * beforeEach(() => { layout = mockPhoneLayout(); });
 * afterEach(() => layout.restore());
 *
 * // later, to cross the breakpoint in a test:
 * act(() => layout.setWidth(1280));
 * ```
 *
 * No Jest APIs inside, so the helpers ship from the package index and work in
 * any test runner.
 */

/** A viewport width that gets the phone layout: an iPhone's 375px. */
export const PHONE_TEST_WIDTH = 375;
/** A viewport width that gets the desktop layout. */
export const DESKTOP_TEST_WIDTH = 1280;

export type MockViewportOptions = {
  /** The viewport width in px. */
  width: number;
  /** Touch-first input: `(hover: none)` and `(pointer: coarse)` match. */
  touch: boolean;
};

export type MockedLayout = {
  /** Resize the simulated viewport; listeners whose answer changed are told. */
  setWidth(width: number): void;
  /** Switch between touch and mouse input; listeners are told. */
  setTouch(touch: boolean): void;
  /** Put back the `matchMedia` (and `innerWidth`) that was there before. */
  restore(): void;
};

type Listener = (event: MediaQueryListEvent) => void;

type Installed = {
  matchMedia: typeof window.matchMedia | undefined;
  innerWidth: number;
};

// What was there before the first mock, so nested mocks restore to it.
let original: Installed | undefined;

function evaluateFeature(
  feature: string,
  viewport: MockViewportOptions,
): boolean {
  const match = /^\(\s*([a-z-]+)\s*:\s*([^)]+?)\s*\)$/.exec(feature.trim());
  if (!match) {
    // A media type: `screen` and `all` apply, `print` does not.
    const type = feature.trim().replace(/^only\s+/, '');
    return type === 'screen' || type === 'all' || type === '';
  }
  const [, name, value] = match;
  const px = parseFloat(value);
  switch (name) {
    case 'max-width':
      return viewport.width <= px;
    case 'min-width':
      return viewport.width >= px;
    case 'hover':
    case 'any-hover':
      return value === (viewport.touch ? 'none' : 'hover');
    case 'pointer':
    case 'any-pointer':
      return value === (viewport.touch ? 'coarse' : 'fine');
    default:
      return false;
  }
}

/** Evaluates a media query against the simulated viewport. */
export function evaluateMediaQuery(
  query: string,
  viewport: MockViewportOptions,
): boolean {
  const bare = query.replace(/^@media\s*/, '');
  return bare.split(',').some(alternative => {
    const negated = /^\s*not\s+/.test(alternative);
    const clauses = alternative.replace(/^\s*not\s+/, '').split(/\s+and\s+/);
    const matches = clauses.every(clause => evaluateFeature(clause, viewport));
    return negated ? !matches : matches;
  });
}

/**
 * Installs a fake `window.matchMedia` for the given viewport. Call `restore()`
 * on the result when the test is done (an `afterEach`). A second call replaces
 * the first.
 */
export function mockViewport(options: MockViewportOptions): MockedLayout {
  if (!original) {
    original = {
      matchMedia: window.matchMedia,
      innerWidth: window.innerWidth,
    };
  }
  const viewport = { ...options };
  // One list per query, as long as this mock is installed: a hook that asks on
  // every render does not pile up entries.
  const lists = new Map<
    string,
    {
      query: string;
      matches: boolean;
      listeners: Set<Listener>;
      list: MediaQueryList;
    }
  >();

  const setInnerWidth = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width,
    });
  };
  setInnerWidth(viewport.width);

  const notify = () => {
    for (const entry of lists.values()) {
      const matches = evaluateMediaQuery(entry.query, viewport);
      if (matches !== entry.matches) {
        entry.matches = matches;
        const event = { matches, media: entry.query } as MediaQueryListEvent;
        entry.listeners.forEach(listener => listener(event));
        entry.list.onchange?.call(entry.list, event);
      }
    }
  };

  const matchMedia = (query: string): MediaQueryList => {
    const existing = lists.get(query);
    if (existing) {
      return existing.list;
    }
    const listeners = new Set<Listener>();
    const entry = {
      query,
      matches: evaluateMediaQuery(query, viewport),
      listeners,
      list: undefined as unknown as MediaQueryList,
    };
    entry.list = {
      media: query,
      get matches() {
        return evaluateMediaQuery(query, viewport);
      },
      onchange: null,
      addListener: (listener: Listener | null) => {
        if (listener) listeners.add(listener);
      },
      removeListener: (listener: Listener | null) => {
        if (listener) listeners.delete(listener);
      },
      addEventListener: (_type: string, listener: Listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: Listener) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
    lists.set(query, entry);
    return entry.list;
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMedia,
  });

  return {
    setWidth(width) {
      viewport.width = width;
      setInnerWidth(width);
      notify();
    },
    setTouch(touch) {
      viewport.touch = touch;
      notify();
    },
    restore() {
      if (!original) {
        return;
      }
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: original.matchMedia,
      });
      setInnerWidth(original.innerWidth);
      original = undefined;
    },
  };
}

/**
 * A phone: a {@link PHONE_TEST_WIDTH}px viewport with touch input, so
 * `usePhoneLayout()` and `useTouchInput()` both answer `true`. Override either
 * — `mockPhoneLayout({ touch: false })` is a narrow desktop window.
 */
export function mockPhoneLayout(
  options: Partial<MockViewportOptions> = {},
): MockedLayout {
  return mockViewport({ width: PHONE_TEST_WIDTH, touch: true, ...options });
}

/**
 * A desktop: a {@link DESKTOP_TEST_WIDTH}px viewport with a mouse. For the
 * other branch of a test that also covers the phone one, where "no
 * `matchMedia` at all" would test the fallback instead of the layout.
 */
export function mockDesktopLayout(
  options: Partial<MockViewportOptions> = {},
): MockedLayout {
  return mockViewport({ width: DESKTOP_TEST_WIDTH, touch: false, ...options });
}
