import { useMemo } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  mockDesktopLayout,
  MockedLayout,
  mockPhoneLayout,
} from '../../testUtils/mockPhoneLayout';
import {
  mockIntersectionObserver,
  type MockedIntersectionObserver,
} from '../../testUtils/mockIntersectionObserver';
import {
  PageHeaderActionsProvider,
  useProvidePageHeaderActions,
} from '../PageHeaderActions';
import {
  ShellPage,
  ShellPageBadgeSkeleton,
  ShellPageExpandedOnly,
  ShellPageFactsSkeleton,
  ShellPageTitleSkeleton,
} from './ShellPage';

function RegistersAction({ label }: { label: string }) {
  const actions = useMemo(() => <button>{label}</button>, [label]);
  useProvidePageHeaderActions(actions);
  return null;
}

function renderAt(url: string, element: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <PageHeaderActionsProvider>
        <Routes>
          <Route path="/connectors/:name/*" element={element} />
        </Routes>
      </PageHeaderActionsProvider>
    </MemoryRouter>,
  );
}

describe('ShellPage', () => {
  it('renders breadcrumbs, the h1, its badge row and the content', () => {
    renderAt(
      '/connectors/jira',
      <ShellPage
        title="Jira"
        breadcrumbs={[
          { label: 'Customize', href: '/customize' },
          { label: 'Connectors', href: '/customize/connectors' },
          { label: 'Jira' },
        ]}
        leading={<span data-testid="tile">J</span>}
        badges={<span>Connected</span>}
        meta="Search, read and update tickets"
        description="A connector to the support desk."
        footer={<p>Footer</p>}
      >
        <p>Tools content</p>
      </ShellPage>,
    );

    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(
      within(crumbs).getByRole('link', { name: 'Customize' }),
    ).toHaveAttribute('href', '/customize');
    expect(
      within(crumbs).getByRole('link', { name: 'Back to Connectors' }),
    ).toHaveAttribute('href', '/customize/connectors');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Jira' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('tile')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(
      screen.getByText('Search, read and update tickets'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('A connector to the support desk.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Tools content')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('renders its own actions, then the registered ones, then the menu', () => {
    renderAt(
      '/connectors/jira',
      <>
        <ShellPage
          title="Jira"
          actions={<button>Edit</button>}
          menu={<button>More actions</button>}
        />
        <RegistersAction label="Test connection" />
      </>,
    );

    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual([
      'Edit',
      'Test connection',
      'More actions',
    ]);
  });

  it('draws routed tabs below the page, keeping the query string', () => {
    renderAt(
      '/connectors/jira/settings',
      <ShellPage
        title="Jira"
        tabsSearch="?installation=gazelle"
        tabs={[
          { id: 'tools', path: '', title: 'Tools' },
          { id: 'used-by', path: 'used-by', title: 'Used by' },
          { id: 'settings', path: 'settings', title: 'Settings' },
        ]}
      />,
    );

    expect(
      screen
        .getAllByRole('tab')
        .map(tab => [tab.textContent, tab.getAttribute('href')]),
    ).toEqual([
      ['Tools', '/connectors/jira?installation=gazelle'],
      ['Used by', '/connectors/jira/used-by?installation=gazelle'],
      ['Settings', '/connectors/jira/settings?installation=gazelle'],
    ]);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Settings',
    );
  });

  it('renders the aside beside the content and leaves out what is not given', () => {
    renderAt(
      '/connectors/jira',
      <ShellPage title="Jira" aside={<aside aria-label="Details" />}>
        <p>Body</p>
      </ShellPage>,
    );

    expect(
      screen.getByRole('complementary', { name: 'Details' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  describe('at phone width', () => {
    let layout: MockedLayout | undefined;
    afterEach(() => {
      layout?.restore();
      layout = undefined;
    });

    const facts = <aside aria-label="Facts">Address: jira.example.com</aside>;

    it('puts the aside first, folded under "Details"', async () => {
      layout = mockPhoneLayout();
      renderAt(
        '/connectors/jira',
        <ShellPage title="Jira" aside={facts}>
          <p>Hundreds of tools</p>
        </ShellPage>,
      );

      const toggle = screen.getByRole('button', { name: 'Details' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(
        screen.queryByRole('complementary', { name: 'Facts' }),
      ).not.toBeInTheDocument();
      // Before the content in reading order, not after it.
      expect(
        toggle.compareDocumentPosition(screen.getByText('Hundreds of tools')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('complementary', { name: 'Facts' }),
      ).toHaveTextContent('Address: jira.example.com');
    });

    // T72: Customize's six tabs with counts scroll sideways in one row.
    it('scrolls a long tab strip to its selected tab, through the gutter', async () => {
      layout = mockPhoneLayout();
      const scrollTo = jest.fn();
      Object.defineProperty(Element.prototype, 'scrollTo', {
        configurable: true,
        writable: true,
        value: scrollTo,
      });
      try {
        const { container } = renderAt(
          '/connectors/jira/workflows',
          <ShellPage
            title="Customize"
            tabs={[
              { id: 'agents', path: 'agents', title: 'Agents', count: 6 },
              { id: 'skills', path: 'skills', title: 'Skills', count: 12 },
              { id: 'tools', path: 'tools', title: 'Connectors', count: 4 },
              { id: 'models', path: 'models', title: 'Models', count: 1 },
              { id: 'flows', path: 'workflows', title: 'Workflows', count: 9 },
              { id: 'runs', path: 'runs', title: 'Runs', count: 30 },
            ]}
          />,
        );

        expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
          'Workflows (9)',
        );
        const strip = container.querySelector('.bui-Tabs')!.parentElement!;
        await waitFor(() => expect(scrollTo).toHaveBeenCalled());
        expect(scrollTo.mock.contexts).toEqual([strip]);

        // The bleed into the page gutter, read from the injected stylesheet
        // (jsdom applies no media rules).
        const bleeds = Array.from(document.styleSheets)
          .flatMap(sheet => Array.from(sheet.cssRules))
          .filter((rule): rule is CSSMediaRule => rule instanceof CSSMediaRule)
          .flatMap(rule => Array.from(rule.cssRules))
          .map(rule => rule.cssText)
          .filter(text => /margin-inline: -16px;/.test(text));
        expect(
          bleeds.some(text =>
            Array.from(strip.classList).some(name =>
              text.startsWith(`.${name} {`),
            ),
          ),
        ).toBe(true);
      } finally {
        delete (Element.prototype as Partial<Element>).scrollTo;
      }
    });

    it('names the fold-out by asideLabel', () => {
      layout = mockPhoneLayout();
      renderAt(
        '/connectors/jira',
        <ShellPage title="Jira" aside={facts} asideLabel="About this agent" />,
      );

      expect(
        screen.getByRole('button', { name: 'About this agent' }),
      ).toBeInTheDocument();
    });

    it('keeps the aside open beside the content on a desktop', () => {
      layout = mockDesktopLayout();
      renderAt(
        '/connectors/jira',
        <ShellPage title="Jira" aside={facts}>
          <p>Hundreds of tools</p>
        </ShellPage>,
      );

      expect(
        screen.queryByRole('button', { name: 'Details' }),
      ).not.toBeInTheDocument();
      const aside = screen.getByRole('complementary', { name: 'Facts' });
      expect(
        aside.compareDocumentPosition(screen.getByText('Hundreds of tools')) &
          Node.DOCUMENT_POSITION_PRECEDING,
      ).toBeTruthy();
    });
  });

  describe('while the page is read', () => {
    let layout: MockedLayout | undefined;
    afterEach(() => {
      layout?.restore();
      layout = undefined;
    });

    it('keeps the header in place, the skeletons named for assistive tech', () => {
      layout = mockDesktopLayout();
      const { container } = renderAt(
        '/connectors/jira',
        <ShellPage
          title={<ShellPageTitleSkeleton label="Loading connector" />}
          breadcrumbs={[{ label: 'Connectors', href: '/connectors' }]}
          badges={<ShellPageBadgeSkeleton />}
          aside={<ShellPageFactsSkeleton />}
        />,
      );

      // The h1 is there from the first render, named meanwhile.
      expect(
        screen.getByRole('heading', { level: 1, name: 'Loading connector' }),
      ).toBeInTheDocument();
      // Title line, badge row and three facts' caption and value.
      expect(container.querySelectorAll('.bui-Skeleton')).toHaveLength(8);
    });
  });

  describe('with a compact header', () => {
    let observer: MockedIntersectionObserver;
    beforeEach(() => {
      observer = mockIntersectionObserver();
    });
    afterEach(() => observer.restore());

    const header = () => screen.getByTestId('shell-page-header');

    function renderLongPage() {
      return renderAt(
        '/connectors/jira',
        <ShellPage
          title={<button>Jira</button>}
          documentTitle="Jira"
          breadcrumbs={[{ label: 'Connectors', href: '/connectors' }]}
          badges={
            <>
              <span>Connected</span>
              <ShellPageExpandedOnly>
                <span>on gazelle</span>
                <button>gazelle</button>
              </ShellPageExpandedOnly>
              <ShellPageExpandedOnly onlyAtPhoneWidth>
                <span>Phone-only detail</span>
              </ShellPageExpandedOnly>
            </>
          }
          meta="Search, read and update tickets"
          description="A connector to the support desk."
          actions={<button>Edit</button>}
          menu={<button>More actions</button>}
          compactHeader
        >
          <RegistersAction label="Pin" />
          <p>A long conversation</p>
        </ShellPage>,
      );
    }

    it('is expanded while the content start is in view or below it', () => {
      renderLongPage();

      expect(header()).not.toHaveAttribute('data-compact');
      act(() => observer.report('in-view'));
      expect(header()).not.toHaveAttribute('data-compact');
      act(() => observer.report('below'));
      expect(header()).not.toHaveAttribute('data-compact');
    });

    it('watches a sentinel that ends where the content starts', () => {
      renderLongPage();

      const [sentinel] = observer.observed();
      expect(sentinel).toBeDefined();
      expect(
        screen
          .getByRole('heading', { level: 1 })
          .compareDocumentPosition(sentinel) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        sentinel.compareDocumentPosition(
          screen.getByText('A long conversation'),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      // Reaching up from there, so it cannot pass the view unseen.
      expect(sentinel).toHaveStyle({ position: 'absolute', bottom: '0px' });
    });

    it('turns compact and sticky once the content start is above the view', () => {
      renderLongPage();

      act(() => observer.report('above'));

      expect(header()).toHaveAttribute('data-compact');
      expect(header()).toHaveStyle({ position: 'sticky', top: '0px' });
    });

    it('does not flick back and forth while the content start moves a few pixels', () => {
      renderLongPage();

      act(() => observer.report('above'));
      expect(header()).toHaveAttribute('data-compact');

      // A reflow nudging the content's start just back into view keeps it
      // compact; coming properly back into view expands it.
      act(() => observer.report(10));
      expect(header()).toHaveAttribute('data-compact');
      act(() => observer.report(-2));
      act(() => observer.report(12));
      expect(header()).toHaveAttribute('data-compact');
      act(() => observer.report(100));
      expect(header()).not.toHaveAttribute('data-compact');

      // And expanded, a few pixels below the edge stay expanded.
      act(() => observer.report(10));
      expect(header()).not.toHaveAttribute('data-compact');
    });

    it('keeps the header, its spacer and the sentinel out of scroll anchoring', () => {
      renderLongPage();
      act(() => observer.report('above'));

      // The compact header is the first thing in view: anchored on, its
      // turning back into the expanded header would scroll the page.
      const [sentinel] = observer.observed();
      for (const element of [
        header(),
        header().nextElementSibling!,
        sentinel.parentElement!,
      ]) {
        expect(element).toHaveStyle({ overflowAnchor: 'none' });
      }
    });

    it('keeps one header: one h1 and one of each action, the same elements', () => {
      renderLongPage();
      const edit = screen.getByRole('button', { name: 'Edit' });
      const heading = screen.getByRole('heading', { level: 1 });

      act(() => observer.report('above'));

      expect(screen.getAllByRole('heading', { level: 1 })).toEqual([heading]);
      expect(screen.getAllByRole('button', { name: 'Edit' })).toEqual([edit]);
      expect(screen.getAllByRole('button', { name: 'Pin' })).toHaveLength(1);
      expect(
        screen.getAllByRole('button', { name: 'More actions' }),
      ).toHaveLength(1);
    });

    it('leaves out the description, the meta text and the expanded-only parts', () => {
      renderLongPage();

      act(() => observer.report('above'));

      expect(screen.getByText('Connected')).toBeVisible();
      expect(screen.getByText('on gazelle')).not.toBeVisible();
      expect(
        screen.queryByRole('button', { name: 'gazelle' }),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('A connector to the support desk.'),
      ).not.toBeVisible();
      expect(
        screen.getByText('Search, read and update tickets'),
      ).not.toBeVisible();
      // Phone-only parts stay at desktop width.
      expect(screen.getByText('Phone-only detail')).toBeVisible();
    });

    it('stays expanded while focus is on a part the compact row leaves out', () => {
      renderLongPage();
      const gazelle = screen.getByRole('button', { name: 'gazelle' });
      act(() => gazelle.focus());

      act(() => observer.report('above'));

      expect(header()).not.toHaveAttribute('data-compact');
      expect(gazelle).toHaveFocus();

      act(() => screen.getByRole('button', { name: 'Edit' }).focus());

      expect(header()).toHaveAttribute('data-compact');
    });

    it('keeps focus on an action as the header turns compact and back', () => {
      renderLongPage();
      const pin = screen.getByRole('button', { name: 'Pin' });
      act(() => pin.focus());

      act(() => observer.report('above'));
      expect(pin).toHaveFocus();

      act(() => observer.report('in-view'));
      expect(header()).not.toHaveAttribute('data-compact');
      expect(pin).toHaveFocus();
    });

    it('scrolls what comes into view clear of the compact header, never the header itself', () => {
      renderLongPage();
      act(() => observer.report('above'));

      // A margin on the content, not padding on the document: padding would
      // count the stuck header's own top as hidden, and focusing a control
      // in it (react-aria focuses the switch's input on every press) would
      // scroll the page to the top and back.
      expect(document.documentElement.style.scrollPaddingTop).toBe('');
      expect(screen.getByText('A long conversation')).toHaveStyle({
        scrollMarginTop:
          'calc(var(--shell-page-compact-header-height, 0px) + 8px)',
      });
      expect(screen.getByRole('button', { name: 'Edit' })).toHaveStyle({
        scrollMarginTop: '0',
      });
    });

    it('publishes the compact header height only while it is compact', () => {
      const { unmount } = renderLongPage();
      const height = () =>
        document.documentElement.style.getPropertyValue(
          '--shell-page-compact-header-height',
        );
      expect(height()).toBe('');

      act(() => observer.report('above'));
      expect(height()).not.toBe('');

      act(() => observer.report('in-view'));
      expect(height()).toBe('');

      act(() => observer.report('above'));
      unmount();
      expect(height()).toBe('');
    });

    it('watches nothing on a page without one', () => {
      renderAt(
        '/connectors/jira',
        <ShellPage title="Jira">
          <p>Content</p>
        </ShellPage>,
      );

      expect(observer.observed()).toHaveLength(0);
      expect(screen.queryByTestId('shell-page-header')).not.toBeInTheDocument();
      expect(document.documentElement.style.scrollPaddingTop).toBe('');
    });
  });
});
