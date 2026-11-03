import { act, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import {
  AT_END_THRESHOLD_PX,
  SCROLLBAR_HOLD_MS,
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

  it('leaves the end when the reader moved up in the frame a chunk landed', () => {
    // The page grew by 60 and the reader moved up by 200 at once: more than
    // any shrinking could explain.
    expect(
      followsAfterScroll(true, { top: 1200, height: 2000 }, at(1000, 2060)),
    ).toBe(false);
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

  it('follows a reader who scrolled down to the end as it was when they began', () => {
    // Scrolled to the end of 2000; a 100px paragraph streamed in before the
    // scroll landed: 100 short of the new end, at the end they went to.
    expect(
      followsAfterScroll(
        false,
        { top: 400, height: 2000 },
        at(1200, 2100),
        2000,
      ),
    ).toBe(true);
  });

  it('does not follow a reader who stopped short of the end as it was', () => {
    expect(
      followsAfterScroll(
        false,
        { top: 400, height: 2000 },
        at(1100, 2100),
        2000,
      ),
    ).toBe(false);
    // Nor without a scrolling input to measure it from.
    expect(
      followsAfterScroll(false, { top: 400, height: 2000 }, at(1200, 2100)),
    ).toBe(false);
  });

  it('leaves the end on a move up even at the end as it was', () => {
    expect(
      followsAfterScroll(
        true,
        { top: 1300, height: 2100 },
        at(1200, 2100),
        2000,
      ),
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

let resizes: (() => void)[] = [];
class FakeResizeObserver {
  constructor(private readonly callback: () => void) {
    resizes.push(callback);
  }
  observe() {}
  disconnect() {
    resizes = resizes.filter(callback => callback !== this.callback);
  }
}
const resize = () => resizes.forEach(callback => callback());

/** The conversation grows by `by` pixels, the way a streamed chunk does. */
function grow(page: ReturnType<typeof fakePage>, by: number) {
  act(() => {
    page.state.height += by;
    resize();
  });
}

type Api = ReturnType<typeof useStickToEnd>;

function Harness({ onReady }: { onReady: (api: Api) => void }) {
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const [replyKey, setReplyKey] = useState(0);
  const api = useStickToEnd(column);
  onReady(api);
  return (
    <>
      <button type="button" aria-expanded={false}>
        Session actions
      </button>
      <div ref={setColumn}>
        <button type="button" aria-expanded={false}>
          Show more
        </button>
        <button type="button">Copy</button>
        <p key={replyKey}>Streaming reply</p>
        <button type="button" onClick={() => setReplyKey(key => key + 1)}>
          Re-mount reply
        </button>
        <textarea aria-label="Message" />
      </div>
    </>
  );
}

describe('useStickToEnd', () => {
  let page: ReturnType<typeof fakePage>;
  let api: Api;
  const stickToEnd = () => api.stickToEnd();
  const original = window.ResizeObserver;

  beforeEach(() => {
    window.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
    page = fakePage();
    resizes = [];
  });
  afterEach(() => {
    page.restore();
    window.ResizeObserver = original;
  });

  function renderAtEnd() {
    const view = render(<Harness onReady={ready => (api = ready)} />);
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

  it('follows again when a chunk streams in before a scroll down to the end lands', () => {
    renderAtEnd();
    page.scrollTo(400);
    grow(page, 300);

    // A wheel down to the end of 2300; a paragraph taller than the threshold
    // lands before the scroll does, so it stops 100 short of the new end.
    fireEvent.wheel(window, { deltaY: 5000 });
    grow(page, 100);
    page.scrollTo(2300 - 800);
    grow(page, 60);

    expect(page.state.top).toBe(2460 - 800);
  });

  it('measures the end as last rendered, not a chunk already in the DOM', () => {
    renderAtEnd();
    page.scrollTo(400);
    grow(page, 300);

    // A chunk is in the DOM but not in a frame yet when the wheel turns: the
    // browser scrolls to the end of 2300, the frame before it.
    page.state.height += 100;
    fireEvent.wheel(window, { deltaY: 5000 });
    page.scrollTo(2300 - 800);
    grow(page, 60);

    expect(page.state.top).toBe(2460 - 800);
  });

  it('measures the end from the latest scroll only, until it ends', () => {
    renderAtEnd();
    page.scrollTo(400);
    fireEvent.wheel(window, { deltaY: 100 });
    page.scrollTo(500);
    fireEvent(window, new Event('scrollend'));
    grow(page, 100);

    // Moved to the end as it was at that wheel, but with no input since.
    page.scrollTo(2000 - 800);
    grow(page, 60);

    expect(page.state.top).toBe(1200);
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
  it('does not take a menu opened outside the conversation for the reader changing it', () => {
    const { getByRole } = renderAtEnd();

    fireEvent.click(getByRole('button', { name: 'Session actions' }));
    grow(page, 400);

    expect(page.state.top).toBe(1600);
  });

  it('counts a change announced with markReaderChange as the reader’s', () => {
    renderAtEnd();

    // The tool activity switch, in the header, adds summaries.
    act(() => api.markReaderChange());
    grow(page, 400);
    expect(page.state.top).toBe(1200);
    grow(page, 60);
    expect(page.state.top).toBe(1200);
  });

  it('lets go when the touched node leaves the document mid-gesture', () => {
    const { getByText, getByRole } = renderAtEnd();

    const reply = getByText('Streaming reply');
    fireEvent.touchStart(reply, { touches: [{ clientY: 400 }] });
    // The text run closes and re-mounts under the finger; the finger lifts
    // on the detached node.
    fireEvent.click(getByRole('button', { name: 'Re-mount reply' }));
    expect(reply.isConnected).toBe(false);
    fireEvent.touchEnd(reply, { touches: [] });
    grow(page, 60);

    expect(page.state.top).toBe(1260);
  });

  it('does not leave on input that cannot move the page up', () => {
    renderAtEnd();

    // A pinch zoom.
    fireEvent.wheel(window, { deltaY: -100, ctrlKey: true });
    grow(page, 60);
    expect(page.state.top).toBe(1260);

    // Locked behind a dialog.
    document.documentElement.style.overflowY = 'hidden';
    fireEvent.wheel(window, { deltaY: -100 });
    document.documentElement.style.removeProperty('overflow-y');
    grow(page, 60);
    expect(page.state.top).toBe(1320);
  });

  it('does not leave a conversation that fits the view on a wheel up', () => {
    render(<Harness onReady={ready => (api = ready)} />);
    page.state.height = 600;
    act(() => stickToEnd());
    expect(page.state.top).toBe(0);

    fireEvent.wheel(window, { deltaY: -100 });
    grow(page, 600);

    expect(page.state.top).toBe(400);
  });

  it('follows on End with the focus left on a toggle', () => {
    const { getByRole } = renderAtEnd();
    page.scrollTo(400);

    fireEvent.keyDown(getByRole('button', { name: 'Show more' }), {
      key: 'End',
    });
    grow(page, 60);

    expect(page.state.top).toBe(2060 - 800);
  });

  it('holds the position while the scrollbar is pressed, and lets go without a mouseup', () => {
    jest.useFakeTimers();
    try {
      renderAtEnd();

      fireEvent.mouseDown(document.documentElement);
      grow(page, 60);
      expect(page.state.top).toBe(1200);

      // Chromium sends no mouseup after a scrollbar drag.
      act(() => {
        jest.advanceTimersByTime(SCROLLBAR_HOLD_MS);
      });
      grow(page, 60);
      expect(page.state.top).toBe(1320);
    } finally {
      jest.useRealTimers();
    }
  });
});

/** A scroll box of its own, like the Create agent assist panel. */
function BoxHarness({ onReady }: { onReady: (api: Api) => void }) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [content, setContent] = useState<HTMLDivElement | null>(null);
  onReady(useStickToEnd(content, scroller));
  return (
    <div ref={setScroller} data-testid="box">
      <div ref={setContent}>
        <p>Reply</p>
      </div>
    </div>
  );
}

describe('useStickToEnd in a scroll box', () => {
  const original = window.ResizeObserver;
  beforeEach(() => {
    window.ResizeObserver =
      FakeResizeObserver as unknown as typeof ResizeObserver;
    resizes = [];
  });
  afterEach(() => {
    window.ResizeObserver = original;
  });

  it('follows in the box, and leaves the end on a wheel up inside it only', () => {
    let api: Api | undefined;
    const { getByTestId, getByText } = render(
      <BoxHarness onReady={ready => (api = ready)} />,
    );
    const box = getByTestId('box');
    const state = { top: 0, height: 1000 };
    jest
      .spyOn(box, 'scrollHeight', 'get')
      .mockImplementation(() => state.height);
    jest.spyOn(box, 'clientHeight', 'get').mockReturnValue(400);
    jest.spyOn(box, 'scrollTop', 'get').mockImplementation(() => state.top);
    jest.spyOn(box, 'scrollTop', 'set').mockImplementation(value => {
      state.top = Math.max(0, Math.min(value, state.height - 400));
    });
    act(() => api!.stickToEnd());
    expect(state.top).toBe(600);

    const growBy = (by: number) =>
      act(() => {
        state.height += by;
        resize();
      });

    // The page behind the panel scrolling is not the reader leaving it.
    fireEvent.wheel(document.body, { deltaY: -100 });
    growBy(100);
    expect(state.top).toBe(700);

    fireEvent.wheel(getByText('Reply'), { deltaY: -100 });
    growBy(100);
    expect(state.top).toBe(700);
  });
});
