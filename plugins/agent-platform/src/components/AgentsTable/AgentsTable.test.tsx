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
