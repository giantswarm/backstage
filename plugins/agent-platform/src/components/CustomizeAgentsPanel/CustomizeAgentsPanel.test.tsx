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

function renderPanel(search = '', organization = 'all') {
  return renderInTestApp(
    <CustomizeAgentsPanel search={search} organization={organization} />,
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );
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

  it('shows a card per agent, grouped by organization, linking to the agent', async () => {
    await renderPanel();

    expect(
      screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent),
    ).toEqual(['engineering', 'support']);
    const link = screen.getByRole('link', { name: 'Support triage' });
    const card = link.closest('article') as HTMLElement;
    expect(link).toHaveAttribute(
      'href',
      '/agent-platform/agents/golem/support/triage',
    );
    expect(within(card).getByText('Ready')).toBeInTheDocument();
    expect(within(card).getByText('Sonnet 4.5')).toBeInTheDocument();
    expect(
      within(card).getByText('2 skills · 2 connectors'),
    ).toBeInTheDocument();
    expect(
      within(
        screen
          .getByRole('link', { name: 'Release notes' })
          .closest('article') as HTMLElement,
      ).getByText('Failed'),
    ).toBeInTheDocument();
  });

  it('narrows to the organization and the search', async () => {
    await renderPanel('', 'support');
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
