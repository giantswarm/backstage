import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` resolves
// against the new route-resolution API, which the classic test app lacks.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { LAST_DAYS_SELECT_CLASS_NAME } from '@giantswarm/backstage-plugin-ui-react';
import { usageRouteRef } from '../../routes';
import { UsageRouter } from './UsageRouter';

// The views are irrelevant here — this is about the tab's routing, which
// second-level tabs it offers and the scope controls above them — and stubbing
// them keeps the tree free of the Mimir and kagent reads they do.
jest.mock('../UsageOverviewPage', () => ({
  UsageOverviewPage: () => <div>overview-view</div>,
}));
jest.mock('../UsageConnectorsPage', () => ({
  UsageConnectorsPage: ({ sections }: { sections: ReactNode[] }) => (
    <div>
      connectors-view
      <span>connectors-sections:{sections.length}</span>
    </div>
  ),
}));
jest.mock('../UsageCostPage', () => ({
  UsageCostPage: () => <div>cost-view</div>,
}));
jest.mock('../UsageConversationsPage', () => ({
  UsageConversationsPage: () => <div>conversations-view</div>,
}));

// The Environment control is the gs scope select under another name, and it
// collapses on a single-installation portal (decision O5) by itself — both
// tested with it — so a marker stands in. The scope state stays mocked for
// anything else in the tree that reads it.
const scopeState = { isSingleInstallation: false, isLoading: false };

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationScope: () => scopeState,
}));

// The scope bar reads the kagent fan-out's reported window through the same
// cached query AgentUsageSection uses, to grey out selections the backend
// cannot answer on Your sessions. The hooks are stubbed: the resolution and
// the read have their own tests, and this file is about what the control does
// with the answer — including before one arrives (`usage: undefined`).
const usageInstallationState: { installation: string | undefined } = {
  installation: 'alpha',
};
jest.mock('../../hooks/useUsageInstallation', () => ({
  useUsageInstallation: () => usageInstallationState,
}));

const sessionUsageState: { usage: { windowDays: number } | undefined } = {
  usage: { windowDays: 30 },
};
jest.mock('../../hooks/useSessionUsage', () => ({
  useSessionUsage: () => sessionUsageState,
}));

jest.mock('../EnvironmentSelect', () => ({
  EnvironmentSelect: ({ component }: { component?: string }) => (
    <div data-testid="environment-select">environment:{component}</div>
  ),
}));

// Pass-throughs: the providers' own reads are not what this file is about.
jest.mock('../QueryClientProvider', () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

const CurrentPath = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{`${pathname}${search}`}</div>;
};

function renderTab(path: string, sections?: ReactNode[]) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/usage/*"
        element={
          <>
            <UsageRouter sections={sections} />
            <CurrentPath />
          </>
        }
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/usage': usageRouteRef },
    },
  );
}

/** The time range select's trigger, named by its label. */
function timeRange() {
  return screen.getByRole('button', { name: /Time range/ });
}

async function chooseWindow(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(timeRange());
  await user.click(screen.getByRole('option', { name }));
}

const MCP_SECTION = [<div key="mcp">contributed section</div>];

describe('UsageRouter', () => {
  beforeEach(() => {
    scopeState.isSingleInstallation = false;
    scopeState.isLoading = false;
    usageInstallationState.installation = 'alpha';
    sessionUsageState.usage = { windowDays: 30 };
  });

  it('renders Overview at the bare path, without a redirect', async () => {
    renderTab('/usage?installation=alpha');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    expect(screen.getByTestId('path')).toHaveTextContent(
      /^\/usage\?installation=alpha$/,
    );
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Overview',
    );
  });

  it('links the second-level tabs to absolute view paths, carrying the scope', async () => {
    // Absolute, not relative: a relative bui href inside a splat route
    // resolves against the whole current pathname, so it would append the
    // active segment (`/usage/overview/cost`) instead of replacing it. The
    // search travels too, so the window and installation survive the switch.
    renderTab('/usage?window=7d');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/usage?window=7d',
    );
    expect(screen.getByRole('tab', { name: 'Cost' })).toHaveAttribute(
      'href',
      '/usage/cost?window=7d',
    );
    expect(screen.getByRole('tab', { name: 'Your sessions' })).toHaveAttribute(
      'href',
      '/usage/your-sessions?window=7d',
    );
  });

  it.each([
    ['', 'overview-view'],
    ['/cost', 'cost-view'],
    ['/your-sessions', 'conversations-view'],
  ])('routes the view at "/usage%s"', async (path, marker) => {
    renderTab(`/usage${path}`);

    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  it('offers three views without a contributed section — Technical details is gone', async () => {
    // T35: every Technical details figure moved to the tab whose question it
    // answers (design-context/implementation/usage-metrics-ia.md), so the view
    // was dropped rather than left empty. Without muster there is no
    // Connectors content, so no Connectors tab over an empty page either.
    renderTab('/usage');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Cost',
      'Your sessions',
    ]);
  });

  it('offers a Connectors view, last, when a section is contributed', async () => {
    // T52: the connector tool calls moved off Overview into their own view.
    renderTab('/usage?window=7d', MCP_SECTION);

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Cost',
      'Your sessions',
      'Connectors',
    ]);
    expect(screen.getByRole('tab', { name: 'Connectors' })).toHaveAttribute(
      'href',
      '/usage/connectors?window=7d',
    );
  });

  it('hands the contributed sections to the Connectors view, not the Overview', async () => {
    renderTab('/usage/connectors', MCP_SECTION);

    expect(
      await screen.findByText('connectors-sections:1'),
    ).toBeInTheDocument();
    expect(screen.queryByText('overview-view')).toBeNull();
  });

  it('sends the Connectors address to Overview when nothing was contributed', async () => {
    renderTab('/usage/connectors?installation=alpha');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        /^\/usage\?installation=alpha$/,
      );
    });
  });

  it.each([
    '/usage/sessions',
    '/usage/typo',
    '/usage/overview',
    '/usage/conversations',
    '/usage/cost/deeper',
  ])('sends an unknown sub-path to Overview: %s', async path => {
    // Without a catch-all these rendered the tab strip over an empty page with
    // no tab active. `/usage/sessions` is the likely guess for "Your
    // sessions", and `conversations` was the view's path before it took its
    // label (never released).
    renderTab(path);

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(/^\/usage$/);
    });
  });

  it('keeps the query string through the catch-all', async () => {
    renderTab('/usage/sessions?installation=alpha');

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        /^\/usage\?installation=alpha$/,
      );
    });
  });

  describe('scope controls', () => {
    it('offers the Environment control when more than one installation is configured', async () => {
      renderTab('/usage');

      expect(await screen.findByTestId('environment-select')).toHaveTextContent(
        'environment:kagent',
      );
    });

    it('offers the time window on the gateway views and sets it in the URL', async () => {
      const user = userEvent.setup();
      renderTab('/usage');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      expect(timeRange()).toHaveTextContent('Last 30 days');
      await chooseWindow(user, 'Last 7 days');

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent(
          '/usage?window=7d',
        );
      });
      expect(timeRange()).toHaveTextContent('Last 7 days');
    });

    it('drops the window parameter for the default window', async () => {
      const user = userEvent.setup();
      renderTab('/usage?window=7d');

      await chooseWindow(user, 'Last 30 days');

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent(/^\/usage$/);
      });
    });

    it('offers the time window on Your sessions too, and sets it in the URL', async () => {
      // The fan-out's own window is fixed, but the view narrows it client-side
      // (AgentUsageSection owns the honest labelling), so the control applies
      // on every view rather than vanishing on one tab.
      const user = userEvent.setup();
      renderTab('/usage/your-sessions');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      await chooseWindow(user, 'Last 7 days');

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent(
          '/usage/your-sessions?window=7d',
        );
      });
      // The Environment control still applies: the fan-out is per installation.
      expect(screen.getByTestId('environment-select')).toBeInTheDocument();
    });

    it('disables windows beyond the backend window on Your sessions, saying why', async () => {
      // kagent computes session usage over a fixed window (30 days here), so
      // a wider selection could only re-show the same figures under a bigger
      // number. The reason is the disabled option's own description: shown
      // under its name on every device and read with it by screen readers.
      const user = userEvent.setup();
      renderTab('/usage/your-sessions');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      await user.click(timeRange());
      const ninety = screen.getByRole('option', { name: 'Last 90 days' });
      expect(ninety).toHaveAttribute('aria-disabled', 'true');
      expect(ninety).toHaveAccessibleDescription(
        'kagent keeps 30 days of session usage',
      );
      for (const name of ['Last 7 days', 'Last 30 days']) {
        expect(screen.getByRole('option', { name })).not.toHaveAttribute(
          'aria-disabled',
        );
      }
    });

    it('keeps every window enabled on the gateway views', async () => {
      // The gateway views query any window directly — only the kagent fan-out
      // has a fixed window, so the limit must not leak across tabs even while
      // its cached response is at hand.
      const user = userEvent.setup();
      renderTab('/usage');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      await user.click(timeRange());
      expect(
        screen.getByRole('option', { name: 'Last 90 days' }),
      ).not.toHaveAttribute('aria-disabled');
    });

    it('keeps every window enabled while the backend window is still loading', async () => {
      // No locked control over a guess: until a response names its window,
      // nothing is greyed out.
      sessionUsageState.usage = undefined;
      const user = userEvent.setup();
      renderTab('/usage/your-sessions');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      await user.click(timeRange());
      expect(
        screen.getByRole('option', { name: 'Last 90 days' }),
      ).not.toHaveAttribute('aria-disabled');
    });

    it('leaves a deep-linked selection beyond the window selected, not clamped', async () => {
      // A shared link saying ?window=90d still lands where it pointed:
      // AgentUsageSection's note explains that the figures cover the backend's
      // own window — the control greys the option but never rewrites the URL.
      const user = userEvent.setup();
      renderTab('/usage/your-sessions?window=90d');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      expect(timeRange()).toHaveTextContent('Last 90 days');
      await user.click(timeRange());
      const ninety = screen.getByRole('option', { name: 'Last 90 days' });
      expect(ninety).toHaveAttribute('aria-disabled', 'true');
      expect(ninety).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/usage/your-sessions?window=90d',
      );
    });

    it('puts the time range and the Environment control straight into the header actions row', async () => {
      // ShellPage's actions row spaces and aligns its items (bottom edges where
      // it holds a labelled field, so the two selects' boxes line up); layout
      // itself is not measured in jsdom, so this pins that the controls are
      // that row's own items rather than a row of their own.
      renderTab('/usage/your-sessions');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      // The select, by the root class it owns.
      const select = timeRange().closest<HTMLElement>(
        `.${LAST_DAYS_SELECT_CLASS_NAME}`,
      )!;
      expect(select).toHaveTextContent(/^Time range/);
      const row = select.parentElement!;
      expect(row.parentElement).toContainElement(
        screen.getByRole('heading', { level: 1 }),
      );
      expect(screen.getByTestId('environment-select').parentElement).toBe(row);
    });
  });

  describe('the page frame', () => {
    it('heads the screen with the platform-standard frame, once', async () => {
      // The ShellPage idiom every platform page uses: "Usage" as the one h1
      // at the standard scale with its description, no per-view heading.
      renderTab('/usage');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Usage',
      );
      expect(
        screen.getByText(
          'See what agents cost, how much they are used and how healthy the platform is.',
        ),
      ).toBeInTheDocument();
    });

    it('draws the views as the page tabs, carrying the scope', async () => {
      renderTab('/usage/cost?installation=alpha');

      expect(await screen.findByText('cost-view')).toBeInTheDocument();
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map(tab => tab.textContent)).toEqual([
        'Overview',
        'Cost',
        'Your sessions',
      ]);
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/usage?installation=alpha',
      );
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Cost',
      );
    });

    it('puts the scope controls in the header', async () => {
      renderTab('/usage');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      const header = screen.getByRole('heading', { level: 1 }).closest('div')
        ?.parentElement?.parentElement as HTMLElement;
      expect(
        within(header).getByRole('button', { name: /Time range/ }),
      ).toBeInTheDocument();
      expect(within(header).getByTestId('environment-select')).toBeVisible();
    });
  });
});
