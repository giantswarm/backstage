import { Route, Routes, useLocation } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
// The NFS test app: `useRouteRef` from `@backstage/frontend-plugin-api` (used by
// the legacy-run redirect) resolves against the new route-resolution API, which
// the classic `@backstage/test-utils` app does not provide.
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { MusterApi, musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { MusterSection } from './MusterSection';

// The views are irrelevant here -- this is about the section's routing -- and
// stubbing them keeps the tree free of the kubernetes/muster reads they do.
jest.mock('../DashboardPage', () => ({
  DashboardPage: () => <div>dashboard-view</div>,
}));
jest.mock('../McpServersPage', () => ({
  McpServersPage: () => <div>servers-view</div>,
}));
jest.mock('../WorkflowsRouter', () => ({
  WorkflowsRouter: () => <div>workflows-view</div>,
}));
jest.mock('../ToolExplorerPage', () => ({
  ToolExplorerPage: () => <div>tools-view</div>,
}));

// MusterInstanceProvider is deliberately NOT stubbed: its `?installation=` write
// is what used to clobber the index redirect. Only its data sources are.
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
    <Routes>
      <Route
        path="/agent-platform/muster/*"
        element={
          <>
            <MusterSection />
            <CurrentPath />
          </>
        }
      />
    </Routes>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/muster': rootRouteRef },
      apis: [[musterApiRef, musterApi]],
    },
  );
}

describe('MusterSection', () => {
  // The active installation is persisted, so each case has to start from a clean
  // slate to exercise the default resolution rather than the previous test's pick.
  beforeEach(() => window.localStorage.clear());

  it('redirects the section index to the dashboard view', async () => {
    renderSection('/agent-platform/muster');

    expect(await screen.findByText('dashboard-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/muster/dashboard',
      );
    });
  });

  // The section's QueryClient is a module-level singleton, so a second visit
  // within a session has the installations list already cached. That used to
  // make MusterInstanceProvider's `?installation=` effect run in the same commit
  // as the index redirect and overwrite it with the pre-redirect path, leaving
  // the section on `/muster` with no view and no selected tab.
  it('keeps the redirect when the installations query is already cached', async () => {
    const first = renderSection('/agent-platform/muster/dashboard');
    expect(await screen.findByText('dashboard-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent('installation=');
    });
    first.unmount();

    renderSection('/agent-platform/muster');

    expect(await screen.findByText('dashboard-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/muster/dashboard?installation=gazelle',
      );
    });
  });

  it('keeps an explicit installation across the index redirect', async () => {
    renderSection('/agent-platform/muster?installation=alpha');

    expect(await screen.findByText('dashboard-view')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('path')).toHaveTextContent(
        '/agent-platform/muster/dashboard?installation=alpha',
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
