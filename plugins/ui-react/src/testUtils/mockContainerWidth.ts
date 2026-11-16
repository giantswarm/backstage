/**
 * Test helper: element widths and a `ResizeObserver` the test drives by hand.
 *
 * jsdom lays nothing out, so every element is 0px wide and a component that
 * measures its container (`useCompactLayout`) never sees a width. This makes
 * `getBoundingClientRect` answer a chosen width for every element, and
 * installs a `ResizeObserver` that reports a new width to whatever it
 * observes.
 *
 * ```ts
 * let container: MockedContainerWidth;
 * beforeEach(() => { container = mockContainerWidth(424); });
 * afterEach(() => container.restore());
 *
 * // later, to widen what is observed:
 * act(() => container.setWidth(936));
 * ```
 *
 * No Jest APIs inside, so it ships from the package index and works in any
 * test runner.
 */
export type MockedContainerWidth = {
  /** Every element is now `width` px wide; observers are told. */
  setWidth(width: number): void;
  /** Put back `getBoundingClientRect` and the `ResizeObserver` there were before. */
  restore(): void;
};

type Observer = { callback: ResizeObserverCallback; nodes: Set<Element> };

export function mockContainerWidth(width: number): MockedContainerWidth {
  let current = width;
  const observers = new Set<Observer>();
  const originalRect = Element.prototype.getBoundingClientRect;
  const originalObserver = globalThis.ResizeObserver;

  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: current,
      bottom: 100,
      width: current,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect;
  };

  class MockResizeObserver {
    private readonly observer: Observer;
    constructor(callback: ResizeObserverCallback) {
      this.observer = { callback, nodes: new Set() };
      observers.add(this.observer);
    }
    observe(node: Element) {
      this.observer.nodes.add(node);
    }
    unobserve(node: Element) {
      this.observer.nodes.delete(node);
    }
    disconnect() {
      this.observer.nodes.clear();
      observers.delete(this.observer);
    }
  }
  globalThis.ResizeObserver =
    MockResizeObserver as unknown as typeof ResizeObserver;

  return {
    setWidth(next) {
      current = next;
      for (const { callback, nodes } of [...observers]) {
        if (nodes.size === 0) continue;
        callback(
          [...nodes].map(
            target =>
              ({
                target,
                contentRect: { width: next, height: 100 },
              }) as unknown as ResizeObserverEntry,
          ),
          {} as ResizeObserver,
        );
      }
    },
    restore() {
      Element.prototype.getBoundingClientRect = originalRect;
      globalThis.ResizeObserver = originalObserver;
      observers.clear();
    },
  };
}
