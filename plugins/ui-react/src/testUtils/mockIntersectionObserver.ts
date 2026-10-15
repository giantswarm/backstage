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
   * that it is now `position`.
   */
  report(position: IntersectionPosition, target?: Element): void;
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
    readonly rootMargin = '0px';
    readonly thresholds = [0];
    readonly targets = new Set<Element>();

    constructor(private readonly callback: IntersectionObserverCallback) {
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

    notify(position: IntersectionPosition, target?: Element) {
      const entries = [...this.targets]
        .filter(element => !target || element === target)
        .map(
          element =>
            ({
              target: element,
              isIntersecting: position === 'in-view',
              intersectionRatio: position === 'in-view' ? 1 : 0,
              boundingClientRect: rect(TOPS[position]),
              intersectionRect: rect(0),
              rootBounds: rect(0, VIEWPORT_HEIGHT),
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
    observed: () => [...observers].flatMap(observer => [...observer.targets]),
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
