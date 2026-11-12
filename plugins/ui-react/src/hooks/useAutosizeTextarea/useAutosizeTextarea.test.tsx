import { useRef } from 'react';
import { render } from '@testing-library/react';
import { useAutosizeTextarea } from './useAutosizeTextarea';

const LINE_HEIGHT = 20;
// Text that takes this many pixels on one line; it wraps to fit the width.
const TEXT_WIDTH = 1000;

type Callback = (entries: Array<{ contentRect: { width: number } }>) => void;

let observerCallback: Callback | undefined;

class FakeResizeObserver {
  constructor(callback: Callback) {
    observerCallback = callback;
  }
  observe() {}
  disconnect() {}
}

const Field = () => {
  const ref = useRef<HTMLDivElement>(null);
  useAutosizeTextarea(ref, { minRows: 1, maxRows: 20 });
  return (
    <div ref={ref}>
      <textarea
        defaultValue="text"
        style={{ lineHeight: `${LINE_HEIGHT}px`, width: '500px' }}
      />
    </div>
  );
};

function deliver(textarea: HTMLTextAreaElement, width: number) {
  textarea.style.width = `${width}px`;
  observerCallback!([{ contentRect: { width } }]);
}

describe('useAutosizeTextarea', () => {
  const originalResizeObserver = window.ResizeObserver;
  let scrollHeight: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    window.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
    // jsdom has no layout: wrap the text by the measuring copy's width.
    scrollHeight = jest
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(function scrollHeightOf(this: HTMLTextAreaElement) {
        const width = parseFloat(this.style.width);
        return Math.ceil(TEXT_WIDTH / width) * LINE_HEIGHT;
      });
  });

  afterEach(() => {
    scrollHeight.mockRestore();
    window.ResizeObserver = originalResizeObserver;
    observerCallback = undefined;
    jest.useRealTimers();
  });

  it('sets the height for a new width in the next frame, not in the observer callback', () => {
    const { container } = render(<Field />);
    const textarea = container.querySelector('textarea')!;
    expect(textarea.style.height).toBe('40px');

    deliver(textarea, 250);
    expect(textarea.style.height).toBe('40px');

    jest.runOnlyPendingTimers();
    expect(textarea.style.height).toBe('80px');
  });

  it('ignores an observation whose width did not change', () => {
    const { container } = render(<Field />);
    const textarea = container.querySelector('textarea')!;
    deliver(textarea, 250);
    jest.runOnlyPendingTimers();

    deliver(textarea, 250);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cancels a pending frame on unmount', () => {
    const { container, unmount } = render(<Field />);
    const textarea = container.querySelector('textarea')!;
    deliver(textarea, 250);
    expect(jest.getTimerCount()).toBe(1);

    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});
