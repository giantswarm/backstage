import type { ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` resolves
// against the new route-resolution API, which the classic test app lacks.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { usageRouteRef } from '../../routes';
import { UsageRouter } from './UsageRouter';

// The views are irrelevant here — this is about the tab's routing and which
// second-level tabs it offers — and stubbing them keeps the tree free of the
// Mimir and kagent reads they do.
jest.mock('../UsageOverviewPage', () => ({
  UsageOverviewPage: () => <div>overview-view</div>,
}));
jest.mock('../UsageCostPage', () => ({
  UsageCostPage: () => <div>cost-view</div>,
}));
jest.mock('../UsageConversationsPage', () => ({
  UsageConversationsPage: () => <div>conversations-view</div>,
}));
jest.mock('../UsageMcpPage', () => ({
  UsageMcpPage: ({ sections }: { sections?: ReactNode[] }) => (
    <div>mcp-view:{sections?.length ?? 0}</div>
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
  it('redirects the tab index to the Overview view, keeping the query string', async () => {
    renderTab('/agent-platform/usage?installation=alpha');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/usage/overview?installation=alpha',
      );
    });
  });

  it('links the second-level tabs to absolute view paths', async () => {
    // Absolute, not relative: a relative bui href inside a splat route
    // resolves against the whole current pathname, so it would append the
    // active segment (`/usage/overview/cost`) instead of replacing it.
    renderTab('/agent-platform/usage/overview', MCP_SECTION);

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/agent-platform/usage/overview',
    );
    expect(screen.getByRole('tab', { name: 'Cost' })).toHaveAttribute(
      'href',
      '/agent-platform/usage/cost',
    );
    expect(screen.getByRole('tab', { name: 'Your sessions' })).toHaveAttribute(
      'href',
      '/agent-platform/usage/conversations',
    );
    expect(screen.getByRole('tab', { name: 'MCP tools' })).toHaveAttribute(
      'href',
      '/agent-platform/usage/mcp',
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

  it('offers no MCP tab when nothing was contributed', async () => {
    renderTab('/agent-platform/usage/overview');

    expect(await screen.findByText('overview-view')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'MCP tools' }),
    ).not.toBeInTheDocument();
  });

  it('still renders a deep-linked MCP view with no contributor', async () => {
    // The route stays mounted whether or not the tab is offered, so a
    // bookmarked URL explains itself rather than 404ing.
    renderTab('/agent-platform/usage/mcp');

    expect(await screen.findByText('mcp-view:0')).toBeInTheDocument();
  });

  it('hands the contributed sections to the MCP view', async () => {
    renderTab('/agent-platform/usage/mcp', MCP_SECTION);

    expect(await screen.findByText('mcp-view:1')).toBeInTheDocument();
  });
});
