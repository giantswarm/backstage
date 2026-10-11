import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
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
} from '../../utils/mockPhoneLayout';
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
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/workflows/:name/*"
          element={
            <>
              <CapturesNavigate />
              <RouteTabs tabs={tabs} search="?installation=gazelle" />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

/** The scroll container: the element around bui's `Tabs` root. */
function stripOf(container: HTMLElement): HTMLElement {
  const root = container.querySelector('.bui-Tabs');
  expect(root).not.toBeNull();
  return root!.parentElement!;
}

describe('RouteTabs', () => {
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
      const phoneRules: string[] = [];
      const desktopRules: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        for (const rule of Array.from(sheet.cssRules)) {
          if (rule instanceof CSSMediaRule) {
            if (rule.conditionText === PHONE_QUERY) {
              phoneRules.push(
                ...Array.from(rule.cssRules).map(inner => inner.cssText),
              );
            }
          } else {
            desktopRules.push(rule.cssText);
          }
        }
      }
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
