import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentRow } from '../AgentsDataProvider';
import { agentsRouteRef } from '../../routes';
import { AgentsTable } from './AgentsTable';

const mockBuildAvatarUrl = jest.fn(
  (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
);

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuildAvatarUrl,
}));

// The row's programmatic navigation, and *only* it: `Link` resolves `useNavigate`
// internally within react-router-dom, so its own client-side navigation is
// untouched by this mock. A call here therefore means the row handler ran.
const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Only the parent RouteRef is mountable — `mountedRoutes` rejects a SubRouteRef —
// and the detail sub-route resolves relative to it.
const renderTable = (element: React.ReactElement) =>
  renderInTestApp(element, {
    mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
  });

const rows: AgentRow[] = [
  {
    id: 'inst-1/sre-team/triager',
    installation: 'inst-1',
    namespace: 'sre-team',
    name: 'Incident triager',
    technicalName: 'incident-triager',
    description: 'Triages incidents',
    model: 'Claude Sonnet 4.6',
    skillCount: 3,
    readiness: 'ready',
  },
  {
    id: 'inst-1/dev/byo',
    installation: 'inst-1',
    namespace: 'dev',
    name: 'BYO agent',
    technicalName: 'byo-agent',
    description: '',
    model: undefined,
    skillCount: 0,
    readiness: 'notReady',
    readinessMessage: 'Deployment is not ready, 0/1 pods are ready',
  },
];

describe('AgentsTable', () => {
  beforeEach(() => {
    mockBuildAvatarUrl.mockClear();
    mockNavigate.mockClear();
  });
  it('renders the column headers', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Installation')).toBeInTheDocument();
    expect(screen.getByText('Namespace')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders each row readiness, explaining a non-ready one on hover', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(
      screen.getByTitle('Deployment is not ready, 0/1 pods are ready'),
    ).toBeInTheDocument();
  });

  it('labels a rejected agent distinctly from a not-ready one', async () => {
    await renderTable(
      <AgentsTable
        rows={[
          {
            ...rows[0],
            readiness: 'notAccepted',
            readinessMessage: 'bad spec',
          },
        ]}
      />,
    );

    expect(screen.getByText('Not accepted')).toBeInTheDocument();
    expect(screen.getByTitle('bad spec')).toBeInTheDocument();
  });

  it('shows an unreconciled agent as pending', async () => {
    await renderTable(
      <AgentsTable rows={[{ ...rows[0], readiness: 'pending' }]} />,
    );

    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders agent rows with resolved model and skill count', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    expect(screen.getByText('Incident triager')).toBeInTheDocument();
    expect(screen.getByText('Triages incidents')).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows a dash for agents without a resolved model', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    expect(screen.getByText('BYO agent')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the empty state when there are no agents', async () => {
    await renderTable(<AgentsTable rows={[]} />);

    expect(screen.getByText('No agents found.')).toBeInTheDocument();
  });

  it('links each agent name to its details page, keyed on all three identity parts', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    // Installation, namespace and the *technical* name — an Agent name is only
    // unique within a namespace on one installation.
    expect(
      screen.getByRole('link', { name: 'Incident triager' }),
    ).toHaveAttribute(
      'href',
      '/agent-platform/agents/inst-1/sre-team/incident-triager',
    );
    expect(screen.getByRole('link', { name: 'BYO agent' })).toHaveAttribute(
      'href',
      '/agent-platform/agents/inst-1/dev/byo-agent',
    );
  });

  it('navigates on a whole-row click', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    await userEvent.click(screen.getByText('Claude Sonnet 4.6'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/agents/inst-1/sre-team/incident-triager',
    );
  });

  // Regression guard: the anchor and the row handler must not both fire, or a
  // single click pushes the same path twice and Back needs two presses.
  it('does not also fire the row handler when the name link is clicked', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    await userEvent.click(
      screen.getByRole('link', { name: 'Incident triager' }),
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('builds each avatar from the technical name at the list size', async () => {
    await renderTable(<AgentsTable rows={rows} />);

    // The avatar seeds from the technical (resource) name, not the display name.
    expect(mockBuildAvatarUrl).toHaveBeenCalledWith(
      'inst-1',
      'incident-triager',
      {
        size: 96,
      },
    );
    expect(mockBuildAvatarUrl).toHaveBeenCalledWith('inst-1', 'byo-agent', {
      size: 96,
    });
  });
});
