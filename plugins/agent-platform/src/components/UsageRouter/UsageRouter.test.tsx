import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
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
  UsageOverviewPage: () => <div>overview-view</div>,
}));
jest.mock('../UsageCostPage', () => ({
  UsageCostPage: () => <div>cost-view</div>,
}));
jest.mock('../UsageConversationsPage', () => ({
  UsageConversationsPage: () => <div>conversations-view</div>,
}));
jest.mock('../UsageTechnicalPage', () => ({
  UsageTechnicalPage: ({ sections }: { sections?: ReactNode[] }) => (
    <div>technical-view:{sections?.length ?? 0}</div>
  ),
}));

// The scope bar's two inputs: the Environment control collapses on a
// single-installation portal (decision O5), which this state drives, and the
// selector itself is the gs scope select under another name — its own
// behaviour is tested with it, so a marker stands in.
const scopeState = { isSingleInstallation: false, isLoading: false };

jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  useInstallationScope: () => scopeState,
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
    scopeState.isSingleInstallation = false;
    scopeState.isLoading = false;
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
    expect(
      screen.getByRole('tab', { name: 'Technical details' }),
    ).toHaveAttribute('href', '/agent-platform/usage/technical?window=7d');
  });

  it.each([
    ['overview', 'overview-view'],
    ['cost', 'cost-view'],
    ['conversations', 'conversations-view'],
    ['technical', 'technical-view:0'],
  ])('routes the %s view', async (path, marker) => {
    renderTab(`/agent-platform/usage/${path}`);

    expect(await screen.findByText(marker)).toBeInTheDocument();
  });

  it('offers all four views whether or not muster contributed a section', async () => {
    // Technical details carries gateway figures of its own, so the tab stays
    // offered without a contributed MCP section.
    renderTab('/agent-platform/usage/overview');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    for (const name of [
      'Overview',
      'Cost',
      'Your sessions',
      'Technical details',
    ]) {
      expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    }
  });

  it('redirects the retired MCP path to Technical details, keeping the query string', async () => {
    renderTab('/agent-platform/usage/mcp?installation=alpha', MCP_SECTION);

    expect(await screen.findByText('technical-view:1')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/usage/technical?installation=alpha',
      );
    });
  });

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

  it('hands the contributed sections to the Technical details view', async () => {
    renderTab('/agent-platform/usage/technical', MCP_SECTION);

    expect(await screen.findByText('technical-view:1')).toBeInTheDocument();
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

    it("hides the time window on Your sessions, whose window is the backend's", async () => {
      renderTab('/agent-platform/usage/conversations');

      expect(await screen.findByText('conversations-view')).toBeInTheDocument();
      expect(
        screen.queryByRole('radio', { name: '7 days' }),
      ).not.toBeInTheDocument();
      // The Environment control still applies: the fan-out is per installation.
      expect(screen.getByTestId('environment-select')).toBeInTheDocument();
    });
  });
});
