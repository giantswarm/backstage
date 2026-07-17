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

// Only the header-actions hook is used from ui-react here; stub it so the test
// doesn't need the PageHeaderActionsProvider (supplied by GSPageLayout in the
// real app).
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  useProvidePageHeaderActions: jest.fn(),
}));

const renderPage = () =>
  renderInTestApp(<AgentsIndexPage />, {
    mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
  });

const baseValue: AgentsContextValue = {
  rows: [],
  isLoading: false,
  isLoadingMore: false,
  hasInstallations: true,
  unreachableInstallations: [],
};

describe('AgentsIndexPage', () => {
  beforeEach(() => {
    mockUseAgents.mockReset();
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
          description: 'Triages incidents',
          model: 'Claude Sonnet 4.6',
          skillCount: 3,
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
          description: '',
          model: undefined,
          skillCount: 0,
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
});
