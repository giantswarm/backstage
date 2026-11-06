import { act, fireEvent, render } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { RESERVED_TURN_ATTRIBUTE } from '../../SessionTimeline';
import {
  END_CHROME_ATTRIBUTE,
  JUMP_MAX_MS,
  NEW_CONTENT_MIN_PX,
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

  it('does not count what arrived in the frame of the scroll as seen', () => {
    // Scrolled up 100 while 300 streamed in below: 200 more below than
    // before, 300 of it new.
    expect(afterScroll({ unseen: false, base: 300 }, 500, 300)).toEqual({
      unseen: false,
      base: 200,
    });
  });
});

/**
 * A page laid out by hand, since jsdom lays nothing out: a view of `view` px,
 * a conversation `content` px tall from the document's top, and a 100px dock
 * stuck to the view's bottom edge (at rest under the content at the end).
 * `top` is clamped like a browser's.
 */
function fakePage() {
  const page = {
    top: 0,
    content: 2000,
    dock: 100,
    view: 800,
  };
  const root = document.documentElement;
  const height = () => page.content + page.dock;
  const clamp = (value: number) =>
    Math.max(0, Math.min(value, height() - page.view));
  const spies = [
    jest.spyOn(root, 'scrollTop', 'get').mockImplementation(() => page.top),
    jest.spyOn(root, 'scrollTop', 'set').mockImplementation(value => {
      page.top = clamp(value);
    }),
    jest.spyOn(root, 'scrollHeight', 'get').mockImplementation(height),
    jest.spyOn(root, 'clientHeight', 'get').mockImplementation(() => page.view),
  ];
  const scrollTo = jest.fn();
  const scrollBy = jest.fn((_x: number, y: number) => {
    page.top = clamp(page.top + y);
  });
  Object.assign(window, { scrollTo, scrollBy });

  // What each observer watches: an element's size changing reaches only the
  // observers watching it.
  const observers = new Map<() => void, Set<Element>>();
  const originalObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    readonly watched = new Set<Element>();
    constructor(callback: () => void) {
      observers.set(callback, this.watched);
    }
    observe(element: Element) {
      this.watched.add(element);
    }
    unobserve(element: Element) {
      this.watched.delete(element);
    }
    disconnect() {
      this.watched.clear();
    }
  } as unknown as typeof ResizeObserver;

  const notify = (resized?: Element) =>
    act(() =>
      observers.forEach((watched, callback) => {
        if (resized ? watched.has(resized) : watched.size > 0) {
          callback();
        }
      }),
    );

  return {
    page,
    scrollTo,
    scrollBy,
    /** The content's bottom, as the element's rect reports it. */
    contentBottom: () => page.content - page.top,
    /** The dock's top: stuck at the view's bottom, or at rest at the end. */
    dockTop: () => Math.min(page.view - page.dock, page.content - page.top),
    /**
     * Something changed size: `resized` when only that element did, the
     * column (and every observer) otherwise.
     */
    resize(
      changes: Partial<Pick<typeof page, 'content' | 'dock' | 'view'>>,
      resized?: Element,
    ) {
      Object.assign(page, changes);
      page.top = clamp(page.top);
      notify(resized);
    },
    scroll(top: number) {
      page.top = clamp(top);
      act(() => {
        window.dispatchEvent(new Event('scroll'));
      });
    },
    atEnd: () => page.top === height() - page.view,
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
  conversation,
  reserved = false,
}: {
  fake: ReturnType<typeof fakePage>;
  onApi: (api: Api) => void;
  conversation: unknown;
  /** The newest content is inside a turn that holds room for its reply. */
  reserved?: boolean;
}) {
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  const api = useJumpToBottom(column, dock, conversation);
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
  const content = (
    <div ref={contentRef} data-testid="newest">
      <button aria-expanded="false">Show more</button>
    </div>
  );
  return (
    <div ref={setColumn}>
      {reserved ? (
        <div {...{ [RESERVED_TURN_ATTRIBUTE]: '' }}>
          <p>The message sent</p>
          {content}
        </div>
      ) : (
        content
      )}
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
  const motion = {
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };

  /** Mounts the page; `converse` gives it the conversation as it changes. */
  const mount = (options: { reserved?: boolean } = {}) => {
    const { rerender, unmount } = render(
      <Harness
        fake={fake}
        onApi={value => (api = value)}
        conversation="opened"
        {...options}
      />,
    );
    return {
      converse: (conversation: string) =>
        rerender(
          <Harness
            fake={fake}
            onApi={value => (api = value)}
            conversation={conversation}
            {...options}
          />,
        ),
      unmount,
    };
  };

  beforeEach(() => {
    jest.useFakeTimers();
    now = 10_000;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    fake = fakePage();
    motion.matches = false;
    window.matchMedia = jest.fn().mockReturnValue(motion);
  });

  afterEach(() => {
    fake.restore();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('opens at the end and lands there while the layout settles', () => {
    const { converse } = mount();
    act(() => api.openAtEnd());
    expect(fake.atEnd()).toBe(true);

    // The dock's measured height lands a frame later, an image in the last
    // reply decodes seconds later: still the conversation it opened on.
    fake.resize({ content: 2100 });
    now += 5_000;
    fake.resize({ content: 2400 });
    expect(fake.atEnd()).toBe(true);
    expect(api.hasNewBelow).toBe(false);

    // The conversation changes: what arrives now is the agent's, and stays
    // below.
    converse('streaming');
    const top = fake.page.top;
    fake.resize({ content: 2500 });
    expect(fake.page.top).toBe(top);
    expect(api.hasNewBelow).toBe(true);
  });

  it('stops landing at the end as soon as the reader does anything', () => {
    mount();
    act(() => api.openAtEnd());
    fireEvent.wheel(window, { deltaY: -100 });
    const top = fake.page.top;
    fake.resize({ content: 2300 });
    expect(fake.page.top).toBe(top);
  });

  describe('once open', () => {
    let opened: ReturnType<typeof mount>;
    const setUp = (options: { reserved?: boolean } = {}) => {
      opened = mount(options);
      act(() => api.openAtEnd());
      // The first streamed token: the open has settled.
      opened.converse('streaming');
    };

    describe('with the newest content at the column’s end', () => {
      beforeEach(() => setUp());

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

      it('counts what streams in during a scroll, which the scroll hears of first', () => {
        fake.scroll(800);
        // One frame: the reader scrolls up 100 as 300 lands below.
        fake.page.content += 300;
        fake.scroll(700);
        fake.resize({});
        expect(api.hasNewBelow).toBe(true);
      });

      it('does not count something above growing while the browser keeps the place', () => {
        fake.scroll(800);
        // An image above the view decodes; scroll anchoring moves the view
        // with it.
        fake.page.content += 200;
        fake.scroll(1000);
        fake.resize({});
        expect(api.hasNewBelow).toBe(false);
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

      it('takes a window made narrower as the reader’s', () => {
        fake.scroll(500);
        const width = window.innerWidth;
        Object.defineProperty(window, 'innerWidth', {
          configurable: true,
          value: width - 300,
        });
        try {
          fireEvent(window, new Event('resize'));
          fake.resize({ content: 2600 });
          expect(api.hasNewBelow).toBe(false);
        } finally {
          Object.defineProperty(window, 'innerWidth', {
            configurable: true,
            value: width,
          });
        }
      });

      it('takes a shorter view (a phone’s address bar) as no new content, and what arrives then as new', () => {
        fake.scroll(500);
        fireEvent(window, new Event('resize'));
        fake.resize({ view: 744 });
        expect(api.hasNewBelow).toBe(false);
        fake.resize({ content: 2200 });
        expect(api.hasNewBelow).toBe(true);
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

      it('finishes a jump at the very bottom with the reader typing meanwhile', () => {
        fake.scroll(300);
        fake.resize({ content: 2600 });
        act(() => api.jumpToBottom());
        // Pressed with Enter, the focus is in the composer: typing does not
        // stop a smooth scroll.
        fireEvent.keyDown(document.querySelector('textarea')!, { key: 'a' });
        fake.scroll(1200);
        fake.resize({ content: 2700 });
        act(() => {
          window.dispatchEvent(new Event('scrollend'));
        });
        expect(fake.atEnd()).toBe(true);
        expect(api.hasNewBelow).toBe(false);
      });

      it('leaves a jump the reader stopped with the wheel where it stopped', () => {
        fake.scroll(300);
        fake.resize({ content: 2600 });
        act(() => api.jumpToBottom());
        fireEvent.wheel(window, { deltaY: -100 });
        fake.scroll(900);
        act(() => {
          window.dispatchEvent(new Event('scrollend'));
        });
        expect(fake.page.top).toBe(900);
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

      it('drops a jump under way when the page goes', () => {
        fake.scroll(300);
        fake.resize({ content: 2600 });
        act(() => api.jumpToBottom());
        opened.unmount();
        act(() => {
          jest.advanceTimersByTime(JUMP_MAX_MS);
        });
        expect(fake.page.top).toBe(300);
      });

      it('jumps without animation under reduced motion', () => {
        motion.matches = true;
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

    it('hears of a reply growing inside the turn that holds room for it', () => {
      setUp({ reserved: true });
      fake.scroll(300);
      // The reply grows inside the reserved turn: neither the column nor the
      // body changes size, only what the turn holds.
      fake.resize(
        { content: 2400 },
        document.querySelector('[data-testid="newest"]')!,
      );
      expect(api.hasNewBelow).toBe(true);
    });
  });
});
