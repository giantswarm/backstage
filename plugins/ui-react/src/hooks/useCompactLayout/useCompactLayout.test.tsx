import { act, render, screen } from '@testing-library/react';
import {
  mockDesktopLayout,
  MockedLayout,
  mockPhoneLayout,
} from '../../testUtils/mockPhoneLayout';
import { useCompactLayout } from './useCompactLayout';

type Observed = { callback: ResizeObserverCallback; node?: Element };

let observers: Observed[] = [];
const OriginalResizeObserver = globalThis.ResizeObserver;

/** Tell every observer that its element is now `width` px wide. */
function resizeTo(width: number) {
  act(() => {
    for (const { callback, node } of observers) {
      callback(
        [
          {
            target: node,
            contentRect: { width, height: 100 },
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    }
  });
}

function Probe() {
  const [ref, isCompact] = useCompactLayout(800);
  return <div ref={ref}>{isCompact ? 'compact' : 'full'}</div>;
}

describe('useCompactLayout', () => {
  let layout: MockedLayout;

  beforeEach(() => {
    observers = [];
    globalThis.ResizeObserver = class {
      private observed: Observed;
      constructor(callback: ResizeObserverCallback) {
        this.observed = { callback };
        observers.push(this.observed);
      }
      observe(node: Element) {
        this.observed.node = node;
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    layout.restore();
    globalThis.ResizeObserver = OriginalResizeObserver;
  });

  it('is full on a desktop until the container is measured', () => {
    layout = mockDesktopLayout();
    render(<Probe />);
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  it('is compact in a container narrower than the minimum, beside a side rail', () => {
    layout = mockDesktopLayout();
    render(<Probe />);
    resizeTo(424);
    expect(screen.getByText('compact')).toBeInTheDocument();
    resizeTo(936);
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  it('is compact at phone width whatever the container measures', () => {
    layout = mockPhoneLayout();
    render(<Probe />);
    resizeTo(936);
    expect(screen.getByText('compact')).toBeInTheDocument();
  });
});
