import '@testing-library/jest-dom';

// jsdom does not implement ResizeObserver, which is used by some ui-react
// components (e.g. via useContainerDimensions). Provide a no-op mock.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
    ResizeObserverMock;
}
