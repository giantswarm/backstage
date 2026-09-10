import { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { dashboardsRouteRef } from '../../routes';
import { DashboardsRouter } from './DashboardsRouter';

// The dashboards themselves are somebody else's question here — this is about
// the tab row and its routing — and stubbing them keeps the kagent reads out of
// the tree. The providers go with them: they exist only to feed the Agents
// dashboard's agent-name join.
jest.mock('../AgentsDashboardPage', () => ({
  AgentsDashboardPage: () => <div>agents-dashboard</div>,
}));
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

function renderTab(path: string, mcpDashboard?: ReactNode) {
  return renderInTestApp(
    <Routes>
      <Route
        path="/agent-platform/dashboards/*"
        element={
          <>
            <DashboardsRouter mcpDashboard={mcpDashboard} />
            <CurrentPath />
          </>
        }
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/dashboards': dashboardsRouteRef },
    },
  );
}

describe('DashboardsRouter', () => {
  it('redirects the tab index to the Agents dashboard, keeping the query string', async () => {
    renderTab('/agent-platform/dashboards?installation=alpha');

    expect(await screen.findByText('agents-dashboard')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/dashboards/agents?installation=alpha',
      );
    });
  });

  it('offers the MCP dashboard as a tab and a route when it is contributed', async () => {
    renderTab('/agent-platform/dashboards/mcp', <div>mcp-dashboard</div>);

    expect(await screen.findByText('mcp-dashboard')).toBeInTheDocument();
    // Absolute hrefs off the tab's own mount point, so the strip keeps working
    // wherever the sub-page is mounted — the reason `useSplatBasePath` is used
    // rather than a hardcoded path.
    expect(screen.getByRole('tab', { name: 'Agents' })).toHaveAttribute(
      'href',
      '/agent-platform/dashboards/agents',
    );
    expect(screen.getByRole('tab', { name: 'MCP' })).toHaveAttribute(
      'href',
      '/agent-platform/dashboards/mcp',
    );
  });

  it('has no MCP tab at all when muster is not registered', async () => {
    renderTab('/agent-platform/dashboards/agents');

    expect(await screen.findByText('agents-dashboard')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'MCP' })).toBeNull();
  });

  it('sends a deep link to the absent MCP dashboard to the Agents one', async () => {
    // The failure this guards: with no route for `mcp` and no fallback, the tab
    // strip draws over blank content — the same hole MusterSection's legacy
    // redirect exists to close. Someone following a link from a portal that has
    // muster into one that does not has to land somewhere.
    renderTab('/agent-platform/dashboards/mcp');

    expect(await screen.findByText('agents-dashboard')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/dashboards/agents',
      );
    });
  });
});
