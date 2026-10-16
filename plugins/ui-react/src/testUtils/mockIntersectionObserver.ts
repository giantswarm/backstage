/**
 * Test helper: an `IntersectionObserver` the test drives by hand.
 *
 * jsdom implements none and lays nothing out, so a component that waits for
 * an element to scroll out of view never sees it happen. This installs a fake
 * that records what is observed and lets the test say where an element now is
 * relative to the viewport.
 *
 * ```ts
 * let observer: MockedIntersectionObserver;
 * beforeEach(() => { observer = mockIntersectionObserver(); });
 * afterEach(() => observer.restore());
 *
 * // later, to scroll the observed elements above the view:
 * act(() => observer.report('above'));
 * ```
 *
 * No Jest APIs inside, so it ships from the package index and works in any
 * test runner.
 */

/** Where an observed element is, relative to the viewport. */
export type IntersectionPosition = 'above' | 'in-view' | 'below';

export type MockedIntersectionObserver = {
  /** The elements observed now, by every observer. */
  observed(): Element[];
  /**
   * Tell the observers watching `target` (by default, every observed element)
   * that it is now `position`: a named place, or the y, in px from the
   * viewport's top, of the element's bottom edge (a negative y is above the
   * view). Each observer answers by its own `rootMargin`'s top, so an
   * observer whose root starts lower sees the element leave earlier.
   */
  report(position: IntersectionPosition | number, target?: Element): void;
  /** Put back the `IntersectionObserver` there was before. */
  restore(): void;
};

const VIEWPORT_HEIGHT = 800;

const TOPS: Record<IntersectionPosition, number> = {
  above: -100,
  'in-view': VIEWPORT_HEIGHT / 2,
  below: VIEWPORT_HEIGHT + 100,
};

function rect(top: number, height = 0): DOMRectReadOnly {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

/** Installs the fake on `window` (and `globalThis`) until `restore()`. */
export function mockIntersectionObserver(): MockedIntersectionObserver {
  const original = (globalThis as { IntersectionObserver?: unknown })
    .IntersectionObserver;
  const observers = new Set<FakeIntersectionObserver>();

  class FakeIntersectionObserver {
    readonly root = null;
    readonly rootMargin: string;
    readonly thresholds = [0];
    readonly targets = new Set<Element>();
    /** Where this observer's root starts: its `rootMargin`'s top, inverted. */
    private readonly rootTop: number;

    constructor(
      private readonly callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.rootMargin = options?.rootMargin ?? '0px';
      this.rootTop = -(parseFloat(this.rootMargin) || 0);
      observers.add(this);
    }

    observe(target: Element) {
      this.targets.add(target);
    }

    unobserve(target: Element) {
      this.targets.delete(target);
    }

    disconnect() {
      this.targets.clear();
      observers.delete(this);
    }

    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }

    notify(position: IntersectionPosition | number, target?: Element) {
      const y = typeof position === 'number' ? position : TOPS[position];
      // Edge-inclusive, as the browser's: a box touching the root intersects.
      const isIntersecting = y >= this.rootTop && y <= VIEWPORT_HEIGHT;
      const entries = [...this.targets]
        .filter(element => !target || element === target)
        .map(
          element =>
            ({
              target: element,
              isIntersecting,
              intersectionRatio: isIntersecting ? 1 : 0,
              boundingClientRect: rect(y),
              intersectionRect: rect(0),
              rootBounds: rect(this.rootTop, VIEWPORT_HEIGHT - this.rootTop),
              time: 0,
            }) as IntersectionObserverEntry,
        );
      if (entries.length > 0) {
        this.callback(entries, this as unknown as IntersectionObserver);
      }
    }
  }

  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver =
    FakeIntersectionObserver;

  return {
    observed: () => [
      ...new Set([...observers].flatMap(observer => [...observer.targets])),
    ],
    report: (position, target) => {
      observers.forEach(observer => observer.notify(position, target));
    },
    restore: () => {
      const target = globalThis as { IntersectionObserver?: unknown };
      if (original === undefined) {
        delete target.IntersectionObserver;
      } else {
        target.IntersectionObserver = original;
      }
    },
  };
}
