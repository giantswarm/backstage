import { screen, within } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { AgentRow, AgentsContextValue } from '../AgentsDataProvider';
import { agentsRouteRef } from '../../routes';
import { CustomizeAgentsPanel } from './CustomizeAgentsPanel';

let mockAgents: Partial<AgentsContextValue>;
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => mockAgents,
}));
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));

function row(overrides: Partial<AgentRow>): AgentRow {
  return {
    id: `golem/${overrides.namespace}/${overrides.technicalName}`,
    installation: 'golem',
    namespace: 'support',
    name: 'Agent',
    technicalName: 'agent',
    description: '',
    skillCount: 0,
    readiness: 'ready',
    ...overrides,
  };
}

const triage = row({
  namespace: 'support',
  name: 'Support triage',
  technicalName: 'triage',
  description: 'Sorts tickets',
  model: 'Sonnet 4.5',
  skillCount: 2,
  toolset: {
    state: 'declared',
    carrier: 'triage',
    selectors: ['server:jira', 'server:slack'],
  },
});
const notes = row({
  namespace: 'engineering',
  name: 'Release notes',
  technicalName: 'notes',
  readiness: 'failed',
});

function renderPanel(search = '') {
  return renderInTestApp(<CustomizeAgentsPanel search={search} />, {
    mountedRoutes: { '/agent-platform/agents': agentsRouteRef },
  });
}

describe('CustomizeAgentsPanel', () => {
  beforeEach(() => {
    mockAgents = {
      rows: [triage, notes],
      isLoading: false,
      hasInstallations: true,
      unreachableInstallations: [],
    };
  });

  it('shows a row per agent with its state, linking to the agent', async () => {
    await renderPanel();

    // One flat, global table — the Connectors tab's presentation — with no
    // organization column (D4): the namespace is no organization.
    const table = screen.getByRole('grid');
    expect(
      within(table).queryByRole('columnheader', { name: /Organization/ }),
    ).not.toBeInTheDocument();
    const triageRow = within(table)
      .getByText('Support triage')
      .closest('tr') as HTMLElement;
    expect(triageRow).toHaveAttribute(
      'data-href',
      '/agent-platform/agents/golem/support/triage',
    );
    expect(within(triageRow).getByText('Sorts tickets')).toBeInTheDocument();
    expect(within(triageRow).queryByText('support')).not.toBeInTheDocument();
    expect(within(triageRow).getByText('Ready')).toBeInTheDocument();
    expect(within(triageRow).getByText('Sonnet 4.5')).toBeInTheDocument();
    expect(
      within(triageRow).getByText('2 skills · 2 connectors'),
    ).toBeInTheDocument();
    const notesRow = within(table)
      .getByText('Release notes')
      .closest('tr') as HTMLElement;
    expect(within(notesRow).getByText('Failed')).toBeInTheDocument();
  });

  it('narrows to the search', async () => {
    await renderPanel('triage');
    expect(screen.getByText('Support triage')).toBeInTheDocument();
    expect(screen.queryByText('Release notes')).not.toBeInTheDocument();
  });

  it('says when the search matches nothing', async () => {
    await renderPanel('zzz');
    expect(screen.getByText('No agents match “zzz”.')).toBeInTheDocument();
  });

  it('shows the loading state, then the empty state', async () => {
    mockAgents = { ...mockAgents, rows: [], isLoading: true };
    const { unmount } = await renderPanel();
    expect(
      await screen.findByLabelText('Reading your agents…'),
    ).toBeInTheDocument();
    unmount();

    mockAgents = { ...mockAgents, isLoading: false };
    await renderPanel();
    expect(screen.getByText('No agents yet')).toBeInTheDocument();
  });

  it('reports the installations it could not read instead of an empty state', async () => {
    mockAgents = { ...mockAgents, rows: [], unreachableInstallations: ['lab'] };
    await renderPanel();
    expect(screen.queryByText('No agents yet')).not.toBeInTheDocument();
    expect(screen.getByText(/lab/)).toBeInTheDocument();
  });
});
