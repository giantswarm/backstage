import { act, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import {
  AT_END_THRESHOLD_PX,
  followsAfterScroll,
  isAtEnd,
  onHeightChange,
  useStickToEnd,
} from './useStickToEnd';

const at = (top: number, height: number, view = 800) => ({
  top,
  height,
  distance: height - top - view,
});

describe('isAtEnd', () => {
  it('counts the end and about two lines short of it', () => {
    expect(isAtEnd(at(1200, 2000))).toBe(true);
    expect(isAtEnd(at(1200 - AT_END_THRESHOLD_PX, 2000))).toBe(true);
    expect(isAtEnd(at(1200 - AT_END_THRESHOLD_PX - 1, 2000))).toBe(false);
  });
});

describe('followsAfterScroll', () => {
  it('leaves the end on any move up while the page kept its height', () => {
    // A nudge of a few pixels, still within the threshold: leaving all the
    // same, so the next streamed line does not pull the reader back.
    expect(
      followsAfterScroll(true, { top: 1200, height: 2000 }, at(1195, 2000)),
    ).toBe(false);
    expect(
      followsAfterScroll(true, { top: 1200, height: 2000 }, at(400, 2000)),
    ).toBe(false);
  });

  it('keeps following when the browser moved the page because it changed size', () => {
    // The Working line went: the page got shorter and the browser clamped.
    expect(
      followsAfterScroll(true, { top: 1200, height: 2000 }, at(1160, 1960)),
    ).toBe(true);
  });

  it('follows again once the reader is back at the end', () => {
    expect(
      followsAfterScroll(false, { top: 400, height: 2000 }, at(1180, 2000)),
    ).toBe(true);
  });

  it('stays away from the end while the reader scrolls elsewhere', () => {
    expect(
      followsAfterScroll(false, { top: 400, height: 2000 }, at(600, 2000)),
    ).toBe(false);
  });
});

describe('onHeightChange', () => {
  it('scrolls a reader following the end to the new end', () => {
    expect(onHeightChange(true, false, at(1200, 2300))).toEqual({
      following: true,
      scrollToEnd: true,
    });
  });

  it('leaves a reader who scrolled away exactly where they are', () => {
    expect(onHeightChange(false, false, at(400, 2300))).toEqual({
      following: false,
      scrollToEnd: false,
    });
  });

  it('never scrolls for a change the reader made, and re-reads the end', () => {
    // Show more on the last message: the page grows under the reader.
    expect(onHeightChange(true, true, at(1200, 2600))).toEqual({
      following: false,
      scrollToEnd: false,
    });
    // A tool activity row closed: the end came back into view.
    expect(onHeightChange(false, true, at(1200, 2000))).toEqual({
      following: true,
      scrollToEnd: false,
    });
  });
});

/**
 * The document's scroll metrics, faked: jsdom lays nothing out. `height` is
 * what the conversation has grown to; `top` is clamped like a browser's.
 */
function fakePage(view = 800) {
  const page = document.documentElement;
  const state = { top: 0, height: 2000 };
  const clamp = (value: number) =>
    Math.max(0, Math.min(value, state.height - view));
  const spies = [
    jest
      .spyOn(page, 'scrollHeight', 'get')
      .mockImplementation(() => state.height),
    jest.spyOn(page, 'clientHeight', 'get').mockReturnValue(view),
    jest.spyOn(page, 'scrollTop', 'get').mockImplementation(() => state.top),
    jest.spyOn(page, 'scrollTop', 'set').mockImplementation(value => {
      state.top = clamp(value);
    }),
  ];
  return {
    state,
    /** The reader scrolls to `top`; the browser then reports it. */
    scrollTo(top: number) {
      state.top = clamp(top);
      fireEvent.scroll(window);
    },
    restore: () => spies.forEach(spy => spy.mockRestore()),
  };
}

let resize: () => void = () => {};
class FakeResizeObserver {
  constructor(callback: () => void) {
    resize = callback;
  }
  observe() {}
  disconnect() {}
}

/** The conversation grows by `by` pixels, the way a streamed chunk does. */
function grow(page: ReturnType<typeof fakePage>, by: number) {
  act(() => {
    page.state.height += by;
    resize();
  });
}

function Harness({ onReady }: { onReady: (stick: () => void) => void }) {
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const stickToEnd = useStickToEnd(column);
  onReady(stickToEnd);
  return (
    <div ref={setColumn}>
      <button type="button" aria-expanded={false}>
        Show more
      </button>
      <button type="button">Copy</button>
      <textarea aria-label="Message" />
    </div>
  );
}

describe('useStickToEnd', () => {
  let page: ReturnType<typeof fakePage>;
  let stickToEnd: () => void;
  const original = window.ResizeObserver;

  beforeEach(() => {
    window.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
    page = fakePage();
  });
  afterEach(() => {
    page.restore();
    window.ResizeObserver = original;
  });

  function renderAtEnd() {
    const view = render(<Harness onReady={stick => (stickToEnd = stick)} />);
    act(() => stickToEnd());
    expect(page.state.top).toBe(1200);
    return view;
  }

  it('follows the reply while the reader is at the end', () => {
    renderAtEnd();

    grow(page, 60);
    grow(page, 300);

    expect(page.state.top).toBe(2000 + 360 - 800);
  });

  it('leaves the reader where they scrolled up to, mid-stream', () => {
    renderAtEnd();

    page.scrollTo(900);
    grow(page, 60);
    grow(page, 300);

    expect(page.state.top).toBe(900);
  });

  it('leaves the end on a wheel up before the page has moved', () => {
    // The wheel's scroll lands a frame later; a chunk arriving in between
    // must not scroll the page back down under it.
    renderAtEnd();

    fireEvent.wheel(window, { deltaY: -100 });
    grow(page, 60);

    expect(page.state.top).toBe(1200);
  });

  it('keeps following on a wheel down at the end', () => {
    renderAtEnd();

    fireEvent.wheel(window, { deltaY: 100 });
    grow(page, 60);

    expect(page.state.top).toBe(1260);
  });

  it('leaves the end on the keys that scroll up, not on typing', () => {
    const { getByRole } = renderAtEnd();

    // The caret moving up in the message box is not the page scrolling.
    fireEvent.keyDown(getByRole('textbox', { name: 'Message' }), {
      key: 'ArrowUp',
    });
    grow(page, 60);
    expect(page.state.top).toBe(1260);

    fireEvent.keyDown(document.body, { key: 'PageUp' });
    grow(page, 60);
    expect(page.state.top).toBe(1260);
  });

  it('leaves the end on a swipe down the screen, and not on a tap', () => {
    renderAtEnd();

    fireEvent.touchStart(window, { touches: [{ clientY: 400 }] });
    fireEvent.touchMove(window, { touches: [{ clientY: 402 }] });
    fireEvent.touchEnd(window, { touches: [] });
    grow(page, 60);
    expect(page.state.top).toBe(1260);

    fireEvent.touchStart(window, { touches: [{ clientY: 400 }] });
    fireEvent.touchMove(window, { touches: [{ clientY: 480 }] });
    grow(page, 60);
    fireEvent.touchEnd(window, { touches: [] });
    grow(page, 60);
    expect(page.state.top).toBe(1260);
  });

  it('does not scroll while a finger is on the screen', () => {
    renderAtEnd();

    fireEvent.touchStart(window, { touches: [{ clientY: 400 }] });
    grow(page, 60);
    expect(page.state.top).toBe(1200);

    // Lifted at the end: following resumes with the next chunk.
    fireEvent.touchEnd(window, { touches: [] });
    grow(page, 60);
    expect(page.state.top).toBe(1320);
  });

  it('follows again once the reader scrolls back to the end', () => {
    renderAtEnd();

    page.scrollTo(400);
    grow(page, 300);
    expect(page.state.top).toBe(400);

    // Back down to within two lines of the end.
    page.scrollTo(2300 - 800 - 20);
    grow(page, 60);

    expect(page.state.top).toBe(2360 - 800);
  });

  it('follows again on End, before its smooth scroll gets there', () => {
    renderAtEnd();
    page.scrollTo(400);

    fireEvent.keyDown(document.body, { key: 'End' });
    grow(page, 60);

    expect(page.state.top).toBe(2060 - 800);
  });

  it('does not count the page getting shorter as scrolling away', () => {
    renderAtEnd();

    // The Working line goes; the browser clamps the position up.
    act(() => {
      page.state.height -= 40;
      page.state.top = page.state.height - 800;
      resize();
    });
    fireEvent.scroll(window);
    grow(page, 200);

    expect(page.state.top).toBe(1160 + 200);
  });

  it('never scrolls for something the reader opened, and stops following if it pushed the end away', () => {
    const { getByRole } = renderAtEnd();

    fireEvent.click(getByRole('button', { name: 'Show more' }));
    grow(page, 400);
    expect(page.state.top).toBe(1200);

    // The reply goes on streaming below what they are reading.
    grow(page, 60);
    expect(page.state.top).toBe(1200);
  });

  it('keeps following past a click that opens nothing', () => {
    const { getByRole } = renderAtEnd();

    fireEvent.click(getByRole('button', { name: 'Copy' }));
    grow(page, 400);

    expect(page.state.top).toBe(1600);
  });

  it('scrolls to the end and follows again when the reader acts there', () => {
    renderAtEnd();
    page.scrollTo(300);

    // Sending a message.
    act(() => stickToEnd());
    expect(page.state.top).toBe(1200);
    grow(page, 60);

    expect(page.state.top).toBe(1260);
  });
});
