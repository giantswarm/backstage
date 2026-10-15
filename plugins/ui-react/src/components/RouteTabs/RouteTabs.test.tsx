import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { PHONE_QUERY } from '../../utils/breakpoints';
import {
  mockDesktopLayout,
  MockedLayout,
  mockPhoneLayout,
} from '../../testUtils/mockPhoneLayout';
import { RouteTabs, RouteTabSpec } from './RouteTabs';

const TABS: RouteTabSpec[] = [
  { id: 'overview', path: '', title: 'Overview' },
  { id: 'run', path: 'run', title: 'Run' },
  { id: 'executions', path: 'executions', title: 'Executions', count: 3 },
];

let navigateTo: (url: string) => void = () => {};
function CapturesNavigate() {
  navigateTo = useNavigate();
  return null;
}

function renderAt(url: string, tabs: RouteTabSpec[] = TABS) {
  const tree = (current: RouteTabSpec[]) => (
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/workflows/:name/*"
          element={
            <>
              <CapturesNavigate />
              <RouteTabs tabs={current} search="?installation=gazelle" />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  const result = render(tree(tabs));
  return {
    ...result,
    /** The same strip, its tabs changed: a count arriving. */
    setTabs: (next: RouteTabSpec[]) => result.rerender(tree(next)),
  };
}

/** The tabs with the executions count set to `count`. */
function withCount(count: RouteTabSpec['count']): RouteTabSpec[] {
  return TABS.map(tab => (tab.id === 'executions' ? { ...tab, count } : tab));
}

/** The CSS rules JSS injected, `@media` ones under their query. */
function injectedRules() {
  const byMedia = new Map<string, string[]>();
  const plain: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of Array.from(sheet.cssRules)) {
      if (rule instanceof CSSMediaRule) {
        byMedia.set(rule.conditionText, [
          ...(byMedia.get(rule.conditionText) ?? []),
          ...Array.from(rule.cssRules).map(inner => inner.cssText),
        ]);
      } else {
        plain.push(rule.cssText);
      }
    }
  }
  return { byMedia, plain };
}

/** The scroll container: the element around bui's `Tabs` root. */
function stripOf(container: HTMLElement): HTMLElement {
  const root = container.querySelector('.bui-Tabs');
  expect(root).not.toBeNull();
  return root!.parentElement!;
}

function Location() {
  const { pathname } = useLocation();
  return <p>{`at ${pathname}`}</p>;
}

describe('RouteTabs', () => {
  it('holds a tab switch for the page’s guard, which makes it once agreed', async () => {
    const onNavigate = jest.fn();
    render(
      <MemoryRouter initialEntries={['/workflows/deploy/run']}>
        <Routes>
          <Route
            path="/workflows/:name/*"
            element={
              <>
                <Location />
                <RouteTabs tabs={TABS} onNavigate={onNavigate} />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByRole('tab', { name: 'Executions (3)' }));
    expect(onNavigate).toHaveBeenCalledWith(
      '/workflows/deploy/executions',
      expect.any(Function),
    );
    expect(screen.getByText('at /workflows/deploy/run')).toBeInTheDocument();

    act(() => onNavigate.mock.calls[0][1]());
    expect(
      screen.getByText('at /workflows/deploy/executions'),
    ).toBeInTheDocument();
  });

  it('links every tab absolutely below the page, keeping the query string', () => {
    renderAt('/workflows/deploy/run');

    expect(
      screen
        .getAllByRole('tab')
        .map(tab => [tab.textContent, tab.getAttribute('href')]),
    ).toEqual([
      ['Overview', '/workflows/deploy?installation=gazelle'],
      ['Run', '/workflows/deploy/run?installation=gazelle'],
      ['Executions (3)', '/workflows/deploy/executions?installation=gazelle'],
    ]);
  });

  it('selects the tab of the current route', () => {
    renderAt('/workflows/deploy/executions');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Executions (3)',
    );
  });

  it('builds the hrefs from an explicit base path when the page is part of the splat', () => {
    render(
      <MemoryRouter initialEntries={['/skills/acme/skills/nested/dir/run']}>
        <Routes>
          <Route
            path="/skills/*"
            element={
              <RouteTabs
                tabs={TABS}
                basePath="/skills/acme/skills/nested/dir"
              />
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getAllByRole('tab').map(tab => tab.getAttribute('href')),
    ).toEqual([
      '/skills/acme/skills/nested/dir',
      '/skills/acme/skills/nested/dir/run',
      '/skills/acme/skills/nested/dir/executions',
    ]);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Run',
    );
  });

  // Counts arrive after the tabs: a tab must not grow when its count does,
  // or every tab right of it moves under the pointer.
  describe('a count', () => {
    it('holds its place with a skeleton while loading, out of the accessible name', () => {
      const { container } = renderAt('/workflows/deploy', withCount('loading'));

      const tab = screen.getByRole('tab', { name: 'Executions' });
      const slot = tab.querySelector('[data-count="loading"]');
      expect(slot).not.toBeNull();
      const skeleton = slot!.firstElementChild;
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
      expect(tab).toHaveTextContent(/^Executions$/);
      // Phrasing content only: a link may not hold a `div` (bui's Skeleton).
      expect(tab.querySelector('div')).toBeNull();
      // The other tabs have no count, and no slot for one.
      expect(container.querySelectorAll('[data-count]')).toHaveLength(1);
      // bui's skeleton, drawn with its tokens on that span.
      const [skeletonRule, ...more] = injectedRules().plain.filter(text =>
        text.startsWith(`.${skeleton!.className} {`),
      );
      expect(more).toEqual([]);
      for (const declaration of [
        'background-color: var(--bui-bg-neutral-2);',
        'border-radius: var(--bui-radius-2);',
        'animation: var(--bui-animate-pulse);',
      ]) {
        expect(skeletonRule).toContain(declaration);
      }
    });

    it('takes the skeleton’s place when it arrives, read as part of the name', () => {
      const { setTabs } = renderAt('/workflows/deploy', withCount('loading'));
      const slot = screen
        .getByRole('tab', { name: 'Executions' })
        .querySelector<HTMLElement>('[data-count="loading"]')!;

      setTabs(withCount(12));

      const tab = screen.getByRole('tab', { name: 'Executions (12)' });
      expect(slot).not.toHaveAttribute('data-count');
      expect(tab.querySelector('[aria-hidden]')).toBeNull();
      // The same slot, which holds the width (below), now with the count.
      expect(slot).toHaveTextContent('(12)');
      expect(tab).toContainElement(slot);
      // Title and count in one inline box: as two items of bui's flex tab,
      // the space between them would be trimmed away.
      expect(tab.childNodes).toHaveLength(1);
      expect(tab.firstElementChild).toHaveTextContent(/^Executions \(12\)$/);
    });

    it('reserves a two-digit count’s width, loaded or not, at every width', () => {
      renderAt('/workflows/deploy', withCount(3));
      const slotClass = screen
        .getByRole('tab', { name: 'Executions (3)' })
        .querySelector('span > span')!.className;

      const { plain } = injectedRules();
      const rule = (selector: string) =>
        plain.filter(text => text.startsWith(`.${slotClass}${selector} {`));
      // A hidden `(00)` shares the count's grid cell, so the slot is never
      // narrower than two digits; tabular figures keep 0–99 that wide.
      expect(rule('')).toEqual([
        expect.stringMatching(
          /display: inline-grid;.*font-variant-numeric: tabular-nums;/,
        ),
      ]);
      expect(rule('::before')).toEqual([
        expect.stringMatching(
          /content: "\(00\)" \/ "";.*grid-area: 1 \/ 1;.*visibility: hidden;/,
        ),
      ]);
      // jsdom's CSSOM keeps the last of two `content`s: the fallback for a
      // browser without alternative text is read off the injected text.
      const styles = Array.from(document.querySelectorAll('style'))
        .map(style => style.textContent)
        .join('\n');
      expect(styles).toMatch(
        new RegExp(
          `\\.${slotClass}::before \\{\\s*content: "\\(00\\)";\\s*content: "\\(00\\)" / "";`,
        ),
      );
      expect(rule(' > *')).toEqual([
        expect.stringContaining('grid-area: 1 / 1;'),
      ]);
    });

    // Unavailable (its source failed or is off): the tab drops the slot
    // rather than keep a blank that reads as a missing number.
    it('leaves no slot when it could not be read', () => {
      const { setTabs } = renderAt('/workflows/deploy', withCount('loading'));

      setTabs(withCount(undefined));

      const tab = screen.getByRole('tab', { name: 'Executions' });
      expect(tab.querySelector('span')).toBeNull();
      expect(tab).toHaveTextContent(/^Executions$/);
    });
  });

  it('selects the index only at the page itself', () => {
    renderAt('/workflows/deploy');
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Overview',
    );
  });

  // T72: at phone width a strip of many tabs (Customize: six, with counts)
  // scrolls sideways instead of squeezing its labels or wrapping a row.
  describe('at phone width', () => {
    const TAB_WIDTH = 120;
    const STRIP_WIDTH = 300;
    let layout: MockedLayout | undefined;
    let scrollTo: jest.Mock;
    let hadScrollTo: boolean;

    beforeEach(() => {
      hadScrollTo = 'scrollTo' in Element.prototype;
      scrollTo = jest.fn();
      // jsdom has no element scrolling and no layout: give the tabs a row of
      // 120px boxes and the strip a 300px viewport.
      Object.defineProperty(Element.prototype, 'scrollTo', {
        configurable: true,
        writable: true,
        value: scrollTo,
      });
      jest
        .spyOn(Element.prototype, 'getBoundingClientRect')
        .mockImplementation(function rect(this: Element) {
          const tabs = Array.from(
            this.parentElement?.querySelectorAll(':scope > [role="tab"]') ?? [],
          );
          const index = tabs.indexOf(this);
          const left = index < 0 ? 0 : index * TAB_WIDTH;
          const width = index < 0 ? STRIP_WIDTH : TAB_WIDTH;
          return {
            left,
            right: left + width,
            width,
            x: left,
            top: 0,
            bottom: 44,
            height: 44,
            y: 0,
            toJSON: () => ({}),
          } as DOMRect;
        });
      jest
        .spyOn(Element.prototype, 'clientWidth', 'get')
        .mockImplementation(() => STRIP_WIDTH);
    });

    afterEach(() => {
      layout?.restore();
      layout = undefined;
      jest.restoreAllMocks();
      if (hadScrollTo) {
        return;
      }
      delete (Element.prototype as Partial<Element>).scrollTo;
    });

    it('scrolls the selected tab to the middle of the strip on mount, at once', async () => {
      layout = mockPhoneLayout();
      const { container } = renderAt('/workflows/deploy/executions');

      // The third tab, at 240px, centred in 300px: 240 - (300 - 120) / 2.
      await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
      expect(scrollTo).toHaveBeenCalledWith({ left: 150, behavior: 'auto' });
      expect(scrollTo.mock.contexts[0]).toBe(stripOf(container));
    });

    it('scrolls the newly selected tab into view, smoothly, when the route changes', async () => {
      layout = mockPhoneLayout();
      renderAt('/workflows/deploy');
      await waitFor(() =>
        expect(scrollTo).toHaveBeenLastCalledWith({
          left: 0,
          behavior: 'auto',
        }),
      );

      act(() => navigateTo('/workflows/deploy/run'));

      // The second tab, at 120px: 120 - 90.
      expect(scrollTo).toHaveBeenLastCalledWith({
        left: 30,
        behavior: 'smooth',
      });
    });

    it('keeps the strip still when a count up to 99 arrives, re-centring past it', async () => {
      layout = mockPhoneLayout();
      const { setTabs } = renderAt(
        '/workflows/deploy/run',
        withCount('loading'),
      );
      await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));

      setTabs(withCount(12));
      setTabs(withCount(99));
      expect(scrollTo).toHaveBeenCalledTimes(1);

      // Three digits outgrow the slot: the tabs' widths change.
      setTabs(withCount(128));
      expect(scrollTo).toHaveBeenCalledTimes(2);
    });

    it('scrolls only the strip, never the page', async () => {
      layout = mockPhoneLayout();
      const scrollIntoView = jest.fn();
      Element.prototype.scrollIntoView = scrollIntoView;
      try {
        const { container } = renderAt('/workflows/deploy/run');
        await waitFor(() => expect(scrollTo).toHaveBeenCalled());
        expect(scrollIntoView).not.toHaveBeenCalled();
        for (const instance of scrollTo.mock.contexts) {
          expect(instance).toBe(stripOf(container));
        }
      } finally {
        delete (Element.prototype as Partial<Element>).scrollIntoView;
      }
    });

    // The underline: bui places it at the selected tab's offset from its
    // `Tabs` root, both measured in screen coordinates. The strip scrolls
    // *around* that root, so tab and root move together and the offset holds
    // under any scroll without re-measuring.
    it('scrolls around bui’s Tabs root, which keeps drawing the underline', () => {
      layout = mockPhoneLayout();
      const { container } = renderAt('/workflows/deploy/run');

      const strip = stripOf(container);
      const root = container.querySelector('.bui-Tabs');
      expect(root?.parentElement).toBe(strip);
      expect(strip.className).toMatch(/strip/);
      expect(root?.querySelectorAll('.bui-TabList')).toHaveLength(1);
      expect(root).toHaveStyle({ '--active-tab-opacity': '1' });
    });

    it('fades the edges that have tabs scrolled off beyond them', () => {
      layout = mockPhoneLayout();
      const { container } = renderAt('/workflows/deploy');
      const strip = stripOf(container);
      Object.defineProperty(strip, 'scrollWidth', {
        configurable: true,
        value: 600,
      });

      const scrollStripTo = (left: number) => {
        strip.scrollLeft = left;
        fireEvent.scroll(strip);
      };
      const edges = () => [
        strip.hasAttribute('data-overflow-start'),
        strip.hasAttribute('data-overflow-end'),
      ];

      scrollStripTo(0);
      expect(edges()).toEqual([false, true]);
      scrollStripTo(150);
      expect(edges()).toEqual([true, true]);
      scrollStripTo(300);
      expect(edges()).toEqual([true, false]);
    });

    it('scrolls one row of 44px-tall tabs, and lays out nothing at desktop width', () => {
      layout = mockPhoneLayout();
      const { container } = renderAt('/workflows/deploy');
      const stripClass = Array.from(stripOf(container).classList).find(
        name => !name.startsWith('bui'),
      );

      // jsdom applies no media rules, so the phone rules are read from the
      // stylesheet JSS injected.
      const { byMedia, plain: desktopRules } = injectedRules();
      const phoneRules = byMedia.get(PHONE_QUERY) ?? [];
      const forStrip = (rules: string[], selector: string) =>
        rules.filter(text => text.startsWith(`.${stripClass}${selector} {`));

      expect(forStrip(phoneRules, '')).toEqual([
        expect.stringMatching(/overflow-x: auto;.*overflow-y: hidden;/),
      ]);
      expect(forStrip(phoneRules, ' .bui-TabList')).toEqual([
        expect.stringContaining('flex-wrap: nowrap;'),
      ]);
      const [tabRule, ...more] = forStrip(phoneRules, ' .bui-Tab');
      expect(more).toEqual([]);
      for (const declaration of [
        'flex-shrink: 0;',
        'white-space: nowrap;',
        'height: 44px;',
        'min-width: 44px;',
      ]) {
        expect(tabRule).toContain(declaration);
      }
      expect(forStrip(phoneRules, ' > .bui-Tabs')).toEqual([
        expect.stringContaining('width: max-content;'),
      ]);
      expect(forStrip(desktopRules, '')).toEqual([]);
    });
  });

  describe('at desktop width', () => {
    let layout: MockedLayout | undefined;

    afterEach(() => {
      layout?.restore();
      layout = undefined;
    });

    it('leaves bui’s strip alone: no scrolling, no edge fades', async () => {
      layout = mockDesktopLayout();
      const scrollTo = jest.fn();
      Object.defineProperty(Element.prototype, 'scrollTo', {
        configurable: true,
        writable: true,
        value: scrollTo,
      });
      try {
        const { container } = renderAt('/workflows/deploy/executions');
        const strip = stripOf(container);
        // Past react-aria's second commit, when a phone strip would scroll.
        await act(() => new Promise(resolve => setTimeout(resolve, 0)));

        expect(scrollTo).not.toHaveBeenCalled();
        expect(strip).not.toHaveAttribute('data-overflow-start');
        expect(strip).not.toHaveAttribute('data-overflow-end');
      } finally {
        delete (Element.prototype as Partial<Element>).scrollTo;
      }
    });
  });
});
