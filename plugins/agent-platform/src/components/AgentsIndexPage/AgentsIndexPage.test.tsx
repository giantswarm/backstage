import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AgentsContextValue } from '../AgentsDataProvider';
import { agentsRouteRef } from '../../routes';
import { AgentsIndexPage } from './AgentsIndexPage';

// Drive the state branches directly via useAgents; the providers become
// pass-throughs so the k8s/model plumbing doesn't need mocking here (that logic
// is covered by AgentsDataProvider/helpers tests).
const mockUseAgents = jest.fn<AgentsContextValue, []>();

jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  useAgents: () => mockUseAgents(),
}));

jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('../ServingProvider', () => ({
  ServingProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// The scope note reads the section scope from gs; none of the page's branches
// depend on it, so it renders nothing here.
jest.mock('../InstallationGroups', () => ({
  ...jest.requireActual('../InstallationGroups'),
  InstallationScopeNote: () => null,
}));

// The inventory gate reads the installation inventory and the section scope
// from gs (kubernetes proxy, cluster-access status); it is covered by its own
// tests there and renders nothing in this page's state branches.
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  InstallationInventoryGate: () => null,
}));

// Stub ui-react so the test doesn't need the PageHeaderActionsProvider (supplied
// by GSPageLayout in the real app). `StatusLabel` is stubbed to its label only —
// this suite covers the page's state branches, and the real status rendering is
// exercised in AgentsTable.test.tsx, which uses the actual component.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  useProvidePageHeaderActions: jest.fn(),
  StatusLabel: ({ label }: { label: string }) => <span>{label}</span>,
}));

const renderPage = () =>
  renderInTestApp(<AgentsIndexPage />, {
    mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
  });

const baseValue: AgentsContextValue = {
  rows: [],
  scope: 'all',
  installations: [],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
};

const triager = {
  id: 'inst-1/sre/triager',
  installation: 'inst-1',
  namespace: 'sre',
  name: 'Incident triager',
  technicalName: 'triager',
  description: 'Triages incidents',
  model: 'Claude Sonnet 4.6',
  skillCount: 3,
  readiness: 'ready' as const,
};

const reviewer = {
  id: 'inst-2/dev/reviewer',
  installation: 'inst-2',
  namespace: 'dev',
  name: 'Code reviewer',
  technicalName: 'reviewer',
  description: '',
  model: undefined,
  skillCount: 0,
  readiness: 'ready' as const,
};

describe('AgentsIndexPage', () => {
  beforeEach(() => {
    mockUseAgents.mockReset();
  });

  it('renders one flat table with the installation on every row under "All installations"', async () => {
    mockUseAgents.mockReturnValue({
      ...baseValue,
      rows: [triager, reviewer],
      installations: ['inst-1', 'inst-2', 'inst-3'],
    });

    await renderPage();

    // No section per installation: one grid, and the Installation column tells
    // the rows apart. An installation without agents has no row and no
    // placeholder of its own.
    expect(screen.getAllByRole('grid')).toHaveLength(1);
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(screen.getByText('Incident triager')).toBeInTheDocument();
    expect(screen.getByText('Code reviewer')).toBeInTheDocument();
    expect(screen.getByText('inst-1')).toBeInTheDocument();
    expect(screen.getByText('inst-2')).toBeInTheDocument();
    expect(screen.queryByText('inst-3')).not.toBeInTheDocument();
    expect(screen.queryByText('no agents here')).not.toBeInTheDocument();
  });

  it('shows the no-installations empty state', async () => {
    mockUseAgents.mockReturnValue({ ...baseValue, hasInstallations: false });

    await renderPage();

    expect(screen.getByText('No installations configured')).toBeInTheDocument();
  });

  it('shows a progress bar and hides the table while initially loading', async () => {
    mockUseAgents.mockReturnValue({ ...baseValue, isLoading: true });

    await renderPage();

    expect(screen.getByTestId('progress')).toBeInTheDocument();
    // The table (and its empty state) must not render until the first agents.
    expect(screen.queryByText('No agents found.')).not.toBeInTheDocument();
  });

  it('shows the table empty state when there are no agents', async () => {
    mockUseAgents.mockReturnValue(baseValue);

    await renderPage();

    expect(screen.getByText('No agents found.')).toBeInTheDocument();
  });

  it('renders agent rows', async () => {
    mockUseAgents.mockReturnValue({
      ...baseValue,
      rows: [
        {
          id: 'inst-1/sre/triager',
          installation: 'inst-1',
          namespace: 'sre',
          name: 'Incident triager',
          technicalName: 'triager',
          description: 'Triages incidents',
          model: 'Claude Sonnet 4.6',
          skillCount: 3,
          readiness: 'ready' as const,
        },
      ],
    });

    await renderPage();

    expect(screen.getByText('Incident triager')).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
  });

  it('shows rows plus an activity bar while more installations are still loading', async () => {
    mockUseAgents.mockReturnValue({
      ...baseValue,
      isLoadingMore: true,
      rows: [
        {
          id: 'inst-1/sre/triager',
          installation: 'inst-1',
          namespace: 'sre',
          name: 'Incident triager',
          technicalName: 'triager',
          description: '',
          model: undefined,
          skillCount: 0,
          readiness: 'ready' as const,
        },
      ],
    });

    await renderPage();

    // Rows are shown (not hidden behind a skeleton) and a progress bar signals
    // the remaining installations are still loading — no textual loading note.
    expect(screen.getByText('Incident triager')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('surfaces unreachable installations in a warning card below the table', async () => {
    mockUseAgents.mockReturnValue({
      ...baseValue,
      unreachableInstallations: ['gremlin', 'gauss'],
    });

    await renderPage();

    expect(
      screen.getByText("Couldn't read 2 installations"),
    ).toBeInTheDocument();
    expect(screen.getByText(/gremlin, gauss/)).toBeInTheDocument();
  });

  it('surfaces unreachable installations even while still loading with no rows yet', async () => {
    // A fleet where the only reachable installations all error: no rows, still
    // "loading". The warning must not be suppressed behind the progress bar.
    mockUseAgents.mockReturnValue({
      ...baseValue,
      isLoading: true,
      unreachableInstallations: ['gremlin'],
    });

    await renderPage();

    expect(screen.getByTestId('progress')).toBeInTheDocument();
    expect(
      screen.getByText("Couldn't read 1 installation"),
    ).toBeInTheDocument();
  });
});
