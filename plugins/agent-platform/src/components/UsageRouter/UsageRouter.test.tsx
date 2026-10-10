import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` resolves
// against the new route-resolution API, which the classic test app lacks.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { usageRouteRef } from '../../routes';
import { UsageRouter } from './UsageRouter';

// The views are irrelevant here — this is about the tab's routing, which
// second-level tabs it offers and the scope controls above them — and stubbing
// them keeps the tree free of the Mimir and kagent reads they do.
jest.mock('../UsageOverviewPage', () => ({
  UsageOverviewPage: ({ sections }: { sections?: ReactNode[] }) => (
    <div>
      overview-view
      <span>overview-sections:{sections?.length ?? 0}</span>
    </div>
  ),
}));
jest.mock('../UsageCostPage', () => ({
  UsageCostPage: () => <div>cost-view</div>,
}));
jest.mock('../UsageConversationsPage', () => ({
  UsageConversationsPage: () => <div>conversations-view</div>,
}));

// The scope bar's two inputs: the Environment control collapses on a
// single-installation portal (decision O5), which this state drives, and the
// selector itself is the gs scope select under another name — its own
// behaviour is tested with it, so a marker stands in.
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

let mockAgentShell = false;
jest.mock('../../hooks/useAgentShell', () => ({
  useAgentShell: () => mockAgentShell,
}));

const CurrentPath = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{`${pathname}${search}`}</div>;
};

function renderTab(path: string, sections?: ReactNode[]) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/usage/*"
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
      mountedRoutes: { '/agent-platform/usage': usageRouteRef },
    },
  );
}

const MCP_SECTION = [<div key="mcp">contributed section</div>];

describe('UsageRouter', () => {
  beforeEach(() => {
    mockAgentShell = false;
    scopeState.isSingleInstallation = false;
    scopeState.isLoading = false;
    usageInstallationState.installation = 'alpha';
    sessionUsageState.usage = { windowDays: 30 };
  });

  it('redirects the tab index to the Overview view, keeping the query string', async () => {
    renderTab('/agent-platform/usage?installation=alpha');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/usage/overview?installation=alpha',
      );
    });
  });

  it('links the second-level tabs to absolute view paths, carrying the scope', async () => {
    // Absolute, not relative: a relative bui href inside a splat route
    // resolves against the whole current pathname, so it would append the
    // active segment (`/usage/overview/cost`) instead of replacing it. The
    // search travels too, so the window and installation survive the switch.
    renderTab('/agent-platform/usage/overview?window=7d');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/agent-platform/usage/overview?window=7d',
    );
    expect(screen.getByRole('tab', { name: 'Cost' })).toHaveAttribute(
      'href',
      '/agent-platform/usage/cost?window=7d',
    );
    expect(screen.getByRole('tab', { name: 'Your sessions' })).toHaveAttribute(
      'href',
      '/agent-platform/usage/conversations?window=7d',
    );
  });

  it.each([
    ['overview', 'overview-view'],
    ['cost', 'cost-view'],
    ['conversations', 'conversations-view'],
  ])('routes the %s view', async (path, marker) => {
    renderTab(`/agent-platform/usage/${path}`);

    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  it('offers exactly three views — Technical details is gone', async () => {
    // T35: every Technical details figure moved to the tab whose question it
    // answers (design-context/implementation/usage-metrics-ia.md), so the view
    // was dropped rather than left empty.
    renderTab('/agent-platform/usage/overview');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(tab => tab.textContent)).toEqual([
      'Overview',
      'Cost',
      'Your sessions',
    ]);
  });

  it.each(['mcp', 'technical'])(
    'redirects the retired %s path to Overview, where its content lives, keeping the query string',
    async retired => {
      renderTab(
        `/agent-platform/usage/${retired}?installation=alpha`,
        MCP_SECTION,
      );

      expect(
        await screen.findByText('overview-sections:1'),
      ).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent(
          '/agent-platform/usage/overview?installation=alpha',
        );
      });
    },
  );

  it.each([
    '/agent-platform/usage/sessions',
    '/agent-platform/usage/typo',
    '/agent-platform/usage/cost/deeper',
  ])('sends an unknown sub-path to Overview: %s', async path => {
    // Without a catch-all these rendered the tab strip over an empty page with
    // no tab active. `/usage/sessions` is the likely guess, since the tab
    // reads "Your sessions" while the path is `conversations`.
    renderTab(path);

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/usage/overview',
      );
    });
  });

  it('keeps the query string through the catch-all', async () => {
    renderTab('/agent-platform/usage/sessions?installation=alpha');

    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/usage/overview?installation=alpha',
      );
    });
  });

  it('hands the contributed sections to the Overview', async () => {
    renderTab('/agent-platform/usage/overview', MCP_SECTION);

    expect(await screen.findByText('overview-sections:1')).toBeInTheDocument();
  });

  describe('scope controls', () => {
    it('offers the Environment control when more than one installation is configured', async () => {
      renderTab('/agent-platform/usage/overview');

      expect(await screen.findByTestId('environment-select')).toHaveTextContent(
        'environment:kagent',
      );
    });

    it('hides the Environment control on a single-installation portal', async () => {
      // Decision O5: agentlab-style setups have nothing to select between.
      scopeState.isSingleInstallation = true;

      renderTab('/agent-platform/usage/overview');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      expect(
        screen.queryByTestId('environment-select'),
      ).not.toBeInTheDocument();
    });

    it('offers the time window on the gateway views and sets it in the URL', async () => {
      const user = userEvent.setup();
      renderTab('/agent-platform/usage/overview');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: '7 days' }));

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent(
          '/agent-platform/usage/overview?window=7d',
        );
      });
    });

    it('drops the window parameter for the default window', async () => {
      const user = userEvent.setup();
      renderTab('/agent-platform/usage/overview?window=7d');

      await user.click(screen.getByRole('radio', { name: '30 days' }));

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent(
          /\/agent-platform\/usage\/overview$/,
        );
      });
    });

    it('offers the time window on Your sessions too, and sets it in the URL', async () => {
      // The fan-out's own window is fixed, but the view narrows it client-side
      // (AgentUsageSection owns the honest labelling), so the control applies
      // on every view rather than vanishing on one tab.
      const user = userEvent.setup();
      renderTab('/agent-platform/usage/conversations');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      await user.click(screen.getByRole('radio', { name: '7 days' }));

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent(
          '/agent-platform/usage/conversations?window=7d',
        );
      });
      // The Environment control still applies: the fan-out is per installation.
      expect(screen.getByTestId('environment-select')).toBeInTheDocument();
    });

    it('disables windows beyond the backend window on Your sessions, saying why', async () => {
      // kagent computes session usage over a fixed window (30 days here), so
      // a wider selection could only re-show the same figures under a bigger
      // number. The reason rides on the greyed button itself — a native title
      // is the one affordance a disabled control still offers.
      renderTab('/agent-platform/usage/conversations');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      const ninety = screen.getByRole('radio', { name: '90 days' });
      expect(ninety).toBeDisabled();
      expect(ninety).toHaveAttribute(
        'title',
        'kagent keeps 30 days of session usage',
      );
      expect(screen.getByRole('radio', { name: '7 days' })).toBeEnabled();
      expect(screen.getByRole('radio', { name: '30 days' })).toBeEnabled();
    });

    it('keeps every window enabled on the gateway views', async () => {
      // The gateway views query any window directly — only the kagent fan-out
      // has a fixed window, so the limit must not leak across tabs even while
      // its cached response is at hand.
      renderTab('/agent-platform/usage/overview');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '90 days' })).toBeEnabled();
    });

    it('keeps every window enabled while the backend window is still loading', async () => {
      // No locked control over a guess: until a response names its window,
      // nothing is greyed out.
      sessionUsageState.usage = undefined;
      renderTab('/agent-platform/usage/conversations');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '90 days' })).toBeEnabled();
    });

    it('leaves a deep-linked selection beyond the window selected, not clamped', async () => {
      // A shared link saying ?window=90d still lands where it pointed:
      // AgentUsageSection's note explains that the figures cover the backend's
      // own window — the control greys the option but never rewrites the URL.
      renderTab('/agent-platform/usage/conversations?window=90d');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      const ninety = screen.getByRole('radio', { name: '90 days' });
      expect(ninety).toBeDisabled();
      expect(ninety).toBeChecked();
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/usage/conversations?window=90d',
      );
    });
  });

  describe('inside the agent shell', () => {
    beforeEach(() => {
      mockAgentShell = true;
    });

    it('heads the screen with the platform-standard frame, once', async () => {
      // The ShellPage idiom every platform page uses: "Usage" as the one h1
      // at the standard scale with its description, no per-view heading.
      renderTab('/agent-platform/usage/overview');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Usage',
      );
      expect(
        screen.getByText(
          "What agents cost, how much they're used, and how healthy the platform is.",
        ),
      ).toBeInTheDocument();
    });

    it('draws the views as the page tabs, carrying the scope', async () => {
      renderTab('/agent-platform/usage/cost?installation=alpha');

      expect(await screen.findByText('cost-view')).toBeInTheDocument();
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map(tab => tab.textContent)).toEqual([
        'Overview',
        'Cost',
        'Your sessions',
      ]);
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
        'href',
        '/agent-platform/usage/overview?installation=alpha',
      );
      expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
        'Cost',
      );
    });

    it('puts the scope controls in the header', async () => {
      renderTab('/agent-platform/usage/overview');

      expect(await screen.findByText('overview-view')).toBeInTheDocument();
      const header = screen.getByRole('heading', { level: 1 }).closest('div')
        ?.parentElement?.parentElement as HTMLElement;
      expect(
        within(header).getByRole('radiogroup', { name: 'Time range' }),
      ).toBeInTheDocument();
      expect(within(header).getByTestId('environment-select')).toBeVisible();
    });
  });
});
