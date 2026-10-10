import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('lists each agent as an avatar row of the prototype, linking to the agent', async () => {
    await renderPanel();

    // The prototype's presentation: one rounded list, an avatar row per agent
    // — no table and no column headers. Global, with no organization (D4):
    // the namespace is no organization.
    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Agents' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const triageLink = within(items[0]).getByRole('link');
    expect(triageLink).toHaveAttribute(
      'href',
      '/agent-platform/agents/golem/support/triage',
    );
    expect(within(triageLink).getByText('Support triage')).toBeInTheDocument();
    expect(within(triageLink).getByText('Sorts tickets')).toBeInTheDocument();
    expect(within(triageLink).getByText('Sonnet 4.5')).toBeInTheDocument();
    expect(
      within(triageLink).getByText('2 skills · 2 connectors'),
    ).toBeInTheDocument();
    expect(within(triageLink).queryByText('support')).not.toBeInTheDocument();
    // A Ready agent shows no state; one that needs a look says so inline.
    expect(within(triageLink).queryByText('Ready')).not.toBeInTheDocument();
    expect(within(items[1]).getByText('Release notes')).toBeInTheDocument();
    expect(within(items[1]).getByText('Failed')).toBeInTheDocument();
    // One environment: no environment fact.
    expect(within(list).queryByText('golem')).not.toBeInTheDocument();
  });

  it('names the environment when the agents span more than one', async () => {
    mockAgents = {
      ...mockAgents,
      rows: [
        triage,
        { ...notes, id: 'lab/engineering/notes', installation: 'lab' },
      ],
    };
    await renderPanel();

    const items = within(
      screen.getByRole('list', { name: 'Agents' }),
    ).getAllByRole('listitem');
    expect(within(items[0]).getByText('golem')).toBeInTheDocument();
    expect(within(items[1]).getByText('lab')).toBeInTheDocument();
  });

  it('narrows to the search', async () => {
    await renderPanel('triage');
    expect(screen.getByText('Support triage')).toBeInTheDocument();
    expect(screen.queryByText('Release notes')).not.toBeInTheDocument();
  });

  it('renders 300 agents a page of 25 at a time', async () => {
    mockAgents = {
      ...mockAgents,
      rows: Array.from({ length: 300 }, (_, i) =>
        row({
          name: `Agent ${String(i + 1).padStart(3, '0')}`,
          technicalName: `agent-${i + 1}`,
        }),
      ),
    };
    await renderPanel();

    const items = () =>
      within(screen.getByRole('list', { name: 'Agents' })).getAllByRole(
        'listitem',
      );
    expect(items()).toHaveLength(25);
    expect(screen.getByText('25 agents shown, 275 more')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show 25 more agents' }),
    );
    expect(items()).toHaveLength(50);
    expect(within(items()[49]).getByText('Agent 050')).toBeInTheDocument();
  });

  it('pages within the search, not the whole list', async () => {
    mockAgents = {
      ...mockAgents,
      rows: Array.from({ length: 300 }, (_, i) =>
        row({ name: `Agent ${i + 1}`, technicalName: `agent-${i + 1}` }),
      ),
    };
    await renderPanel('Agent 29');

    // Agent 29 and Agent 290–299: one page, nothing to show more of.
    expect(
      within(screen.getByRole('list', { name: 'Agents' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(11);
    expect(screen.queryByRole('button', { name: /more/ })).toBeNull();
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
