import type { ReactNode } from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { ConnectorPageTarget } from '@giantswarm/backstage-plugin-muster';
import type { AgentRow } from '../AgentsDataProvider';
import { agentsRouteRef } from '../../routes';
import { ConnectorUsedBy } from './ConnectorUsedBy';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

function mockPassThrough({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

let mockTarget: ConnectorPageTarget | undefined;
jest.mock('@giantswarm/backstage-plugin-muster', () => ({
  useConnectorPageTarget: () => mockTarget,
}));

let mockRows: AgentRow[] = [];
let mockUnreachable: string[] = [];
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: mockPassThrough,
  useAgents: () => ({
    rows: mockRows,
    isLoading: false,
    unreachableInstallations: mockUnreachable,
  }),
}));
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: mockPassThrough,
}));
jest.mock('../AgentPlatformCookieAuth', () => ({
  AgentPlatformCookieAuth: mockPassThrough,
}));
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));

function row(
  name: string,
  toolset: AgentRow['toolset'],
  installation = 'gazelle',
): AgentRow {
  return {
    id: `${installation}/team/${name}`,
    installation,
    namespace: 'team',
    name,
    technicalName: name.toLowerCase().replace(/\s+/g, '-'),
    description: '',
    skillCount: 0,
    readiness: 'Ready' as AgentRow['readiness'],
    toolset,
  };
}

const declared = (...selectors: string[]): AgentRow['toolset'] => ({
  state: 'declared',
  selectors,
  carrier: 'agent',
});

beforeEach(() => {
  mockTarget = {
    name: 'jira',
    installation: 'gazelle',
    serverNames: ['jira'],
    ownsTool: name => name.startsWith('x_jira_'),
    readOnlyToolCount: 3,
  };
  mockUnreachable = [];
  mockRows = [
    row('Support Triage', declared('preset:read-only')),
    row(
      'Escalation Helper',
      declared('preset:read-only', 'tool:x_jira_comment', 'tool:x_jira_move'),
    ),
    row('Ops', declared('server:jira')),
    row('Other', declared('server:grafana')),
    row('Elsewhere', declared('preset:full'), 'walrus'),
    row('Unknown', { state: 'unresolved', carrier: 'unknown' }),
  ];
});

async function render() {
  await renderInTestApp(<ConnectorUsedBy />, {
    mountedRoutes: {
      '/agent-platform/agents': agentsRouteRef,
    },
  });
}

describe('ConnectorUsedBy', () => {
  it('lists the agents on the installation whose toolset reaches the connector', async () => {
    await render();

    const list = screen.getByRole('grid', {
      name: 'Agents using this connector',
    });
    const items = within(list).getAllByRole('row');
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringContaining('Escalation HelperLook things up · 2 tools'),
      expect.stringContaining('OpsAll tools'),
      expect.stringContaining('Support TriageLook things up'),
    ]);
    expect(screen.queryByText('Other')).not.toBeInTheDocument();
    expect(screen.queryByText('Elsewhere')).not.toBeInTheDocument();
    expect(
      screen.getByText('The tools of 1 more agent could not be read.'),
    ).toBeInTheDocument();
  });

  it('opens an agent from anywhere on its row', async () => {
    await render();

    await userEvent.click(screen.getByText('All tools'));

    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/agents/gazelle/team/ops',
      undefined,
    );
  });

  it('says when no agent uses the connector', async () => {
    mockRows = [row('Other', declared('server:grafana'))];
    await render();

    expect(
      screen.getByText('No agent on gazelle uses this connector.'),
    ).toBeInTheDocument();
  });

  it('does not claim an unread installation has no users', async () => {
    mockUnreachable = ['gazelle'];
    await render();

    expect(
      screen.getByText('The agents could not be read'),
    ).toBeInTheDocument();
  });

  it('renders nothing outside a connector page', async () => {
    mockTarget = undefined;
    await render();

    expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  });
});
