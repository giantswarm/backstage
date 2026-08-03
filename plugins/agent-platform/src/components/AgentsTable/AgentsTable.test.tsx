import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { AgentRow } from '../AgentsDataProvider';
import { AgentsTable } from './AgentsTable';

const mockBuildAvatarUrl = jest.fn(
  (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/48/${name}.png`,
);

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => mockBuildAvatarUrl,
}));

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
  });
  it('renders the column headers', async () => {
    await renderInTestApp(<AgentsTable rows={rows} />);

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Installation')).toBeInTheDocument();
    expect(screen.getByText('Namespace')).toBeInTheDocument();
    expect(screen.getByText('Model')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders each row readiness, explaining a non-ready one on hover', async () => {
    await renderInTestApp(<AgentsTable rows={rows} />);

    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Not ready')).toBeInTheDocument();
    expect(
      screen.getByTitle('Deployment is not ready, 0/1 pods are ready'),
    ).toBeInTheDocument();
  });

  it('labels a rejected agent distinctly from a not-ready one', async () => {
    await renderInTestApp(
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
    await renderInTestApp(
      <AgentsTable rows={[{ ...rows[0], readiness: 'pending' }]} />,
    );

    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('renders agent rows with resolved model and skill count', async () => {
    await renderInTestApp(<AgentsTable rows={rows} />);

    expect(screen.getByText('Incident triager')).toBeInTheDocument();
    expect(screen.getByText('Triages incidents')).toBeInTheDocument();
    expect(screen.getByText('Claude Sonnet 4.6')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows a dash for agents without a resolved model', async () => {
    await renderInTestApp(<AgentsTable rows={rows} />);

    expect(screen.getByText('BYO agent')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows the empty state when there are no agents', async () => {
    await renderInTestApp(<AgentsTable rows={[]} />);

    expect(screen.getByText('No agents found.')).toBeInTheDocument();
  });

  it('builds each avatar from the technical name at the list size', async () => {
    await renderInTestApp(<AgentsTable rows={rows} />);

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
