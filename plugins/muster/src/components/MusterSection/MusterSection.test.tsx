import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` (used by
// the legacy-run redirect) resolves against the new route-resolution API, which
// the classic `@backstage/test-utils` app does not provide.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { MusterApi, musterApiRef } from '../../apis';
import {
  agentPlatformMcpDashboardExternalRouteRef,
  rootRouteRef,
} from '../../routes';
import { MusterSection } from './MusterSection';

// The views are irrelevant here -- this is about the section's routing -- and
// stubbing them keeps the tree free of the kubernetes/muster reads they do.
jest.mock('../McpServersRouter', () => ({
  McpServersRouter: () => <div>servers-view</div>,
}));
jest.mock('../WorkflowsRouter', () => ({
  WorkflowsRouter: () => <div>workflows-view</div>,
}));
jest.mock('../ToolExplorerPage', () => ({
  ToolExplorerPage: () => <div>tools-view</div>,
}));

// MusterInstanceProvider is deliberately NOT stubbed: its `?installation=` write
// is what used to clobber the index redirect. Only its data sources are.
// An empty inventory (no gs.installations) makes the provider list the
// backend's installations as they are.
jest.mock('@giantswarm/backstage-plugin-gs', () => {
  const { useSearchParams } = jest.requireActual('react-router-dom');
  return {
    ALL_INSTALLATIONS: 'all',
    useInstallationInventory: () => ({
      entries: [],
      home: undefined,
      isLoading: false,
      isProbing: false,
      installationsWith: () => [],
      refresh: jest.fn(),
    }),
    // The section-wide scope, reduced to what these routing tests need: the URL
    // parameter when present, "all" otherwise -- the gs hook's first rule.
    useInstallationScope: () => {
      const [params] = useSearchParams();
      return {
        scope: params.get('installation') ?? 'all',
        setScope: jest.fn(),
        installations: [],
        home: undefined,
        isSingleInstallation: false,
        isLoading: false,
      };
    },
  };
});
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({
    resources: [],
    errors: [],
    queries: [],
    isLoading: false,
    retry: jest.fn(),
  }),
  useShowErrors: () => jest.fn(),
}));

// Two installations, so a redirect that drops `?installation=` is visible as the
// default (`gazelle`, the first entry) replacing an explicitly requested one.
const musterApi = {
  listInstallations: jest.fn(async () => ({
    installations: [{ name: 'gazelle' }, { name: 'alpha' }],
  })),
} as unknown as MusterApi;

const CurrentPath = () => {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{`${pathname}${search}`}</div>;
};

function renderSection(path: string) {
  return renderInTestApp(
    // `CurrentPath` sits *outside* the routes, not inside the element: the
    // legacy redirects now navigate out of `/agent-platform/muster/*`
    // altogether, so a probe mounted in that route unmounts with it and there
    // would be nothing left to read the landing path off.
    <>
      <Routes>
        <Route path="/agent-platform/muster/*" element={<MusterSection />} />
      </Routes>
      <CurrentPath />
    </>,
    {
      initialRouteEntries: [path],
      mountedRoutes: {
        '/agent-platform/muster': rootRouteRef,
        // Bound, so the legacy redirects below assert where they actually land
        // rather than the `../servers` fallback they take when agent-platform
        // is disabled. This also checks the `defaultTarget` spelling
        // (`agent-platform.mcpDashboard`) — the second coupling-by-string in
        // this pair of plugins, and one that fails silently.
        '/agent-platform/dashboards/mcp':
          agentPlatformMcpDashboardExternalRouteRef,
      },
      apis: [[musterApiRef, musterApi]],
    },
  );
}

describe('MusterSection', () => {
  // The active installation is persisted, so each case has to start from a clean
  // slate to exercise the default resolution rather than the previous test's pick.
  beforeEach(() => window.localStorage.clear());

  it('redirects the section index to the servers view', async () => {
    renderSection('/agent-platform/muster');

    expect(await screen.findByText('servers-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/muster/servers',
      );
    });
  });

  // The section's QueryClient is a module-level singleton, so a second visit
  // within a session has the installations list already cached. That used to
  // make MusterInstanceProvider's `?installation=` effect run in the same commit
  // as the index redirect and overwrite it with the pre-redirect path, leaving
  // the section on `/muster` with no view and no selected tab. The provider no
  // longer writes the default back at all -- under "All installations" the
  // home muster is shown without pinning it -- so the URL stays clean.
  it('keeps the redirect when the installations query is already cached', async () => {
    const first = renderSection('/agent-platform/muster/servers');
    expect(await screen.findByText('servers-view')).toBeInTheDocument();
    first.unmount();

    renderSection('/agent-platform/muster');

    expect(await screen.findByText('servers-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/muster/servers',
      );
    });
    expect(screen.getByTestId('path')).not.toHaveTextContent('installation=');
  });

  it('keeps an explicit installation across the index redirect', async () => {
    renderSection('/agent-platform/muster?installation=alpha');

    expect(await screen.findByText('servers-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/muster/servers?installation=alpha',
      );
    });
  });

  it('no longer offers a dashboard or MCP usage as views of this section', async () => {
    // Both moved to the Agent Platform's Dashboards tab, so the tab strip must
    // not still advertise either.
    renderSection('/agent-platform/muster/servers');

    expect(await screen.findByText('servers-view')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Dashboard' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'MCP usage' })).toBeNull();
  });

  it.each(['dashboard', 'usage'])(
    'redirects the legacy %s deep link to the MCP dashboard, keeping the query string',
    async path => {
      // Required, not a courtesy: without the redirect the path falls through
      // to `*`, MusterViews renders, and its inner Routes has no fallback — so
      // the tab strip would draw over blank content. `dashboard` matters most:
      // the section index used to redirect there, so it is what bookmarks hold.
      renderSection(`/agent-platform/muster/${path}?installation=alpha`);

      await waitFor(() => {
        expect(screen.getByTestId('path')).toHaveTextContent(
          '/agent-platform/dashboards/mcp?installation=alpha',
        );
      });
    },
  );

  it('falls back to the servers view when agent-platform is disabled', async () => {
    // The external ref is then unbound, and the redirect has to land
    // *somewhere* — the tab strip over blank content is the failure it exists
    // to prevent, so the fallback matters as much as the target.
    renderInTestApp(
      <>
        <Routes>
          <Route path="/agent-platform/muster/*" element={<MusterSection />} />
        </Routes>
        <CurrentPath />
      </>,
      {
        initialRouteEntries: ['/agent-platform/muster/dashboard'],
        // No `agentPlatformMcpDashboard` binding here: that is what "disabled"
        // means for the target plugin.
        mountedRoutes: { '/agent-platform/muster': rootRouteRef },
        apis: [[musterApiRef, musterApi]],
      },
    );

    expect(await screen.findByText('servers-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/muster/servers',
      );
    });
  });

  it('redirects the legacy workflow run deep link to the workflow detail', async () => {
    renderSection('/agent-platform/muster/workflows/my-flow/run');

    expect(await screen.findByText('workflows-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/muster/workflows/my-flow',
      );
    });
  });
});
