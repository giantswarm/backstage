import { renderInTestApp } from '@backstage/test-utils';
import { screen } from '@testing-library/react';
import { AgentRow } from '../AgentsDataProvider';
import { AgentsTable } from './AgentsTable';

const rows: AgentRow[] = [
  {
    id: 'inst-1/sre-team/triager',
    installation: 'inst-1',
    namespace: 'sre-team',
    name: 'Incident triager',
    description: 'Triages incidents',
    model: 'Claude Sonnet 4.6',
    skillCount: 3,
  },
  {
    id: 'inst-1/dev/byo',
    installation: 'inst-1',
    namespace: 'dev',
    name: 'BYO agent',
    description: '',
    model: undefined,
    skillCount: 0,
  },
];

describe('AgentsTable', () => {
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
});
