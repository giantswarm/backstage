import { act, fireEvent, render } from '@testing-library/react';
import { useCallback, useState } from 'react';
import {
  END_CHROME_ATTRIBUTE,
  JUMP_MAX_MS,
  NEW_CONTENT_MIN_PX,
  OPEN_SETTLE_MS,
  SEEN_SLACK_PX,
  afterContentChange,
  afterScroll,
  useJumpToBottom,
} from './useJumpToBottom';

const quiet = { readerChange: false, jumping: false };

describe('afterContentChange', () => {
  it('counts content that grows below the visible part as new', () => {
    // At the end (nothing below), a line streams in under the composer.
    expect(afterContentChange({ unseen: false, base: -24 }, 20, quiet)).toEqual(
      { unseen: true, base: -24 },
    );
    // Scrolled up 1000px, more arrives at the end.
    expect(
      afterContentChange({ unseen: false, base: 1000 }, 1040, quiet),
    ).toEqual({ unseen: true, base: 1000 });
  });

  it('counts content that ends in view as seen', () => {
    // The reply streams into the room under the message just sent.
    expect(
      afterContentChange({ unseen: false, base: -400 }, -380, quiet),
    ).toEqual({ unseen: false, base: -380 });
    // A line cut by the composer's edge is not content below.
    expect(
      afterContentChange({ unseen: true, base: -24 }, SEEN_SLACK_PX, quiet),
    ).toEqual({ unseen: false, base: SEEN_SLACK_PX });
  });

  it('ignores growth of less than a line', () => {
    expect(
      afterContentChange(
        { unseen: false, base: 500 },
        500 + NEW_CONTENT_MIN_PX,
        quiet,
      ).unseen,
    ).toBe(false);
  });

  it('ignores content that shrank and came back to where it was', () => {
    // The Working line goes, then the reply's last message takes its place.
    const shrunk = afterContentChange({ unseen: false, base: 500 }, 470, quiet);
    expect(afterContentChange(shrunk, 500, quiet).unseen).toBe(false);
    expect(afterContentChange(shrunk, 540, quiet).unseen).toBe(true);
  });

  it('takes a change the reader made as theirs, not as new content', () => {
    expect(
      afterContentChange({ unseen: false, base: 500 }, 900, {
        readerChange: true,
        jumping: false,
      }),
    ).toEqual({ unseen: false, base: 900 });
    // It does not clear a cue that was already up.
    expect(
      afterContentChange({ unseen: true, base: 500 }, 900, {
        readerChange: true,
        jumping: false,
      }).unseen,
    ).toBe(true);
  });

  it('shows nothing while a jump to the bottom is under way', () => {
    expect(
      afterContentChange({ unseen: false, base: 500 }, 900, {
        readerChange: false,
        jumping: true,
      }).unseen,
    ).toBe(false);
  });
});

describe('afterScroll', () => {
  it('clears the cue once the reader reaches the end', () => {
    expect(afterScroll({ unseen: true, base: 300 }, -24)).toEqual({
      unseen: false,
      base: -24,
    });
  });

  it('keeps the cue while there is still content below', () => {
    expect(afterScroll({ unseen: true, base: 300 }, 200)).toEqual({
      unseen: true,
      base: 200,
    });
    expect(afterScroll({ unseen: false, base: 300 }, 200)).toEqual({
      unseen: false,
      base: 200,
    });
  });
});

/**
 * A page laid out by hand, since jsdom lays nothing out: a view of 800px, a
 * conversation `content` px tall from the document's top, and a 100px dock
 * stuck to the view's bottom edge (at rest under the content at the end).
 * `top` is clamped like a browser's.
 */
function fakePage() {
  const view = 800;
  const page = {
    top: 0,
    content: 2000,
    dock: 100,
  };
  const root = document.documentElement;
  const height = () => page.content + page.dock;
  const clamp = (value: number) =>
    Math.max(0, Math.min(value, height() - view));
  const spies = [
    jest.spyOn(root, 'scrollTop', 'get').mockImplementation(() => page.top),
    jest.spyOn(root, 'scrollTop', 'set').mockImplementation(value => {
      page.top = clamp(value);
    }),
    jest.spyOn(root, 'scrollHeight', 'get').mockImplementation(height),
    jest.spyOn(root, 'clientHeight', 'get').mockReturnValue(view),
  ];
  const scrollTo = jest.fn();
  const scrollBy = jest.fn((_x: number, y: number) => {
    page.top = clamp(page.top + y);
  });
  Object.assign(window, { scrollTo, scrollBy });

  const observers: Array<() => void> = [];
  const originalObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    callback: () => void;
    constructor(callback: () => void) {
      this.callback = callback;
      observers.push(() => this.callback());
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  return {
    page,
    view,
    scrollTo,
    scrollBy,
    /** The content's bottom, as the element's rect reports it. */
    contentBottom: () => page.content - page.top,
    /** The dock's top: stuck at the view's bottom, or at rest at the end. */
    dockTop: () => Math.min(view - page.dock, page.content - page.top),
    /** The content (or the dock) changed size: the observer hears of it. */
    resize(changes: Partial<Pick<typeof page, 'content' | 'dock'>>) {
      Object.assign(page, changes);
      page.top = clamp(page.top);
      act(() => observers.forEach(notify => notify()));
    },
    scroll(top: number) {
      page.top = clamp(top);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
    },
    atEnd: () => page.top === height() - view,
    restore() {
      spies.forEach(spy => spy.mockRestore());
      globalThis.ResizeObserver = originalObserver;
    },
  };
}

type Api = ReturnType<typeof useJumpToBottom>;

function Harness({
  fake,
  onApi,
}: {
  fake: ReturnType<typeof fakePage>;
  onApi: (api: Api) => void;
}) {
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const api = useJumpToBottom(column, dock);
  onApi(api);
  const contentRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        element.getBoundingClientRect = () =>
          ({
            top: fake.contentBottom() - 10,
            bottom: fake.contentBottom(),
          }) as DOMRect;
      }
    },
    [fake],
  );
  const dockRef = useCallback(
    (element: HTMLDivElement | null) => {
      if (element) {
        Object.defineProperty(element, 'offsetHeight', {
          configurable: true,
          get: () => fake.page.dock,
        });
        element.getBoundingClientRect = () =>
          ({
            top: fake.dockTop(),
            bottom: fake.dockTop() + fake.page.dock,
          }) as DOMRect;
      }
      setDock(element);
    },
    [fake],
  );
  return (
    <div ref={setColumn}>
      <div ref={contentRef}>
        <button aria-expanded="false">Show more</button>
      </div>
      <div {...{ [END_CHROME_ATTRIBUTE]: '' }} />
      <div {...{ [END_CHROME_ATTRIBUTE]: '' }} ref={dockRef}>
        <textarea aria-label="Message" />
      </div>
    </div>
  );
}

describe('useJumpToBottom', () => {
  let fake: ReturnType<typeof fakePage>;
  let api: Api;
  let now = 0;

  const mount = () => {
    render(<Harness fake={fake} onApi={value => (api = value)} />);
  };

  beforeEach(() => {
    jest.useFakeTimers();
    now = 10_000;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    fake = fakePage();
    window.matchMedia = jest.fn().mockReturnValue({ matches: false });
  });

  afterEach(() => {
    fake.restore();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens at the end and lands there while the layout settles', () => {
    mount();
    act(() => api.openAtEnd());
    expect(fake.atEnd()).toBe(true);

    // The dock's measured height lands a frame later.
    fake.resize({ content: 2100 });
    expect(fake.atEnd()).toBe(true);
    expect(api.hasNewBelow).toBe(false);

    // Settled: the next chunk is the agent's, and stays below.
    now += OPEN_SETTLE_MS + 1;
    const top = fake.page.top;
    fake.resize({ content: 2200 });
    expect(fake.page.top).toBe(top);
    expect(api.hasNewBelow).toBe(true);
  });

  it('stops landing at the end as soon as the reader scrolls', () => {
    mount();
    act(() => api.openAtEnd());
    fireEvent.wheel(window, { deltaY: -100 });
    const top = fake.page.top;
    fake.resize({ content: 2300 });
    expect(fake.page.top).toBe(top);
  });

  describe('once open', () => {
    beforeEach(() => {
      mount();
      act(() => api.openAtEnd());
      now += OPEN_SETTLE_MS + 1;
    });

    it('does not follow a streaming reply at the end, and offers the way down', () => {
      const top = fake.page.top;
      // Token by token: a line at a time below the composer.
      for (let line = 1; line <= 5; line++) {
        fake.resize({ content: 2000 + line * 20 });
        expect(fake.page.top).toBe(top);
      }
      expect(api.hasNewBelow).toBe(true);
    });

    it('does not show for a few pixels', () => {
      fake.resize({ content: 2000 + NEW_CONTENT_MIN_PX });
      expect(api.hasNewBelow).toBe(false);
    });

    it('offers the way down to a reader who scrolled up when more arrives', () => {
      fake.scroll(300);
      expect(api.hasNewBelow).toBe(false);
      fake.resize({ content: 2400 });
      expect(fake.page.top).toBe(300);
      expect(api.hasNewBelow).toBe(true);
    });

    it('goes away when the reader reaches the end themselves', () => {
      fake.resize({ content: 2400 });
      expect(api.hasNewBelow).toBe(true);
      // Part of the way: still below.
      fake.scroll(fake.page.top + 100);
      expect(api.hasNewBelow).toBe(true);
      fake.scroll(100_000);
      expect(api.hasNewBelow).toBe(false);
    });

    it('takes a disclosure the reader opened as theirs', () => {
      fake.scroll(500);
      fireEvent.click(document.querySelector('[aria-expanded]')!);
      fake.resize({ content: 2600 });
      expect(api.hasNewBelow).toBe(false);
    });

    it('takes a change announced with markReaderChange as theirs', () => {
      fake.scroll(500);
      act(() => api.markReaderChange());
      fake.resize({ content: 2600 });
      expect(api.hasNewBelow).toBe(false);
    });

    it('takes a window resize as the reader’s', () => {
      fake.scroll(500);
      fireEvent(window, new Event('resize'));
      fake.resize({ content: 2600 });
      expect(api.hasNewBelow).toBe(false);
    });

    it('keeps the end in view when the composer grows under it', () => {
      // Three lines typed: the dock grows by 60 at the end of the page.
      fake.resize({ dock: 160 });
      expect(fake.scrollBy).toHaveBeenCalledWith(0, 60);
      expect(fake.atEnd()).toBe(true);
      expect(api.hasNewBelow).toBe(false);
    });

    it('does not scroll or cue for the composer growing away from the end', () => {
      fake.scroll(300);
      fake.resize({ dock: 160 });
      expect(fake.scrollBy).not.toHaveBeenCalled();
      expect(fake.page.top).toBe(300);
      expect(api.hasNewBelow).toBe(false);
    });

    it('jumps to the very bottom, smoothly, and finishes there', () => {
      fake.scroll(300);
      fake.resize({ content: 2600 });
      expect(api.hasNewBelow).toBe(true);

      act(() => api.jumpToBottom());
      expect(api.hasNewBelow).toBe(false);
      expect(fake.scrollTo).toHaveBeenCalledWith({
        top: 2700,
        behavior: 'smooth',
      });
      // A chunk lands during the smooth scroll: no cue flashes up meanwhile.
      fake.scroll(1200);
      fake.resize({ content: 2700 });
      expect(api.hasNewBelow).toBe(false);
      // The smooth scroll ends short of the end that moved; it finishes at
      // the very bottom.
      act(() => {
        window.dispatchEvent(new Event('scrollend'));
      });
      expect(fake.atEnd()).toBe(true);
      expect(api.hasNewBelow).toBe(false);

      // What streams in after that is new again.
      fake.resize({ content: 2760 });
      expect(api.hasNewBelow).toBe(true);
    });

    it('finishes a jump where no scrollend comes', () => {
      fake.scroll(300);
      fake.resize({ content: 2600 });
      act(() => api.jumpToBottom());
      act(() => {
        jest.advanceTimersByTime(JUMP_MAX_MS);
      });
      expect(fake.atEnd()).toBe(true);
    });

    it('jumps without animation under reduced motion', () => {
      (window.matchMedia as jest.Mock).mockReturnValue({ matches: true });
      fake.scroll(300);
      fake.resize({ content: 2600 });
      act(() => api.jumpToBottom());
      expect(fake.scrollTo).not.toHaveBeenCalled();
      expect(fake.atEnd()).toBe(true);
      expect(api.hasNewBelow).toBe(false);
    });

    it('puts a turn the reader sent at the top of the view and clears the cue', () => {
      fake.scroll(300);
      fake.resize({ content: 2600 });
      expect(api.hasNewBelow).toBe(true);
      const turn = document.createElement('div');
      turn.scrollIntoView = jest.fn();
      document.body.appendChild(turn);
      act(() => api.revealTurn(turn));
      expect(turn.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
      expect(api.hasNewBelow).toBe(false);
      turn.remove();
    });
  });
});
