import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeatureFlagState } from '@backstage/frontend-plugin-api';
import {
  mockApis,
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
import { AGENT_SHELL_FLAG } from '@giantswarm/backstage-plugin-agent-platform-common';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';

import { musterApiRef, type ToolSummary } from '../../apis';
import { mcpServersRouteRef } from '../../routes';
import { MCPServer } from '../../lib/k8s';
import { McpServersRouter } from '../McpServersRouter';
import { toolCountsLine } from './NewConnectorTestPage';

// Each test walks the real multi-step flow with plenty of typing, which gets
// slow when the whole plugin suite runs in parallel (same as BotPrsPage).
jest.setTimeout(30_000);

/** Registered servers of the active installation, per test. */
let mockMcpServers: MCPServer[] = [];

jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    isSingleInstallation: true,
    installationInfos: [],
    activeInstallation: 'gazelle',
    activeInstallationInfo: {
      name: 'gazelle',
      endpoint: 'https://muster.gazelle.example.com/mcp',
      requiresAuth: true,
    },
    setActiveInstallation: jest.fn(),
    mcpServers: mockMcpServers,
    isLoading: false,
    retry: jest.fn(),
  }),
  useMusterSession: () => ({
    authenticated: true,
    connecting: false,
    connect: jest.fn(),
  }),
}));

jest.mock('../McpServersPage', () => ({
  McpServersPage: () => <div>servers-list</div>,
}));

jest.mock('../NewMcpServerPage/useTransportDetection', () => ({
  useTransportDetection: () => ({ detected: undefined, probing: false }),
}));

const callTool = jest.fn();
const listServers = jest.fn();
const getAuthStatus = jest.fn();
const filterTools = jest.fn();

const musterApi = {
  callTool,
  listServers,
  getAuthStatus,
  filterTools,
} as unknown as jest.Mocked<import('../../apis').MusterApi>;

function renderWizard(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, musterApi]]}>
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Routes>
            <Route
              path="/agent-platform/connectors/*"
              element={<McpServersRouter />}
            />
          </Routes>
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/connectors': mcpServersRouteRef },
      apis: [
        mockApis.featureFlags({
          initialStates: { [AGENT_SHELL_FLAG]: FeatureFlagState.Active },
        }),
      ],
    },
  );
}

/** Walks the real flow to a registered connector so the Test step has one. */
async function renderTestStep() {
  const result = await renderWizard('/agent-platform/connectors/new');
  await userEvent.type(
    screen.getByLabelText(/^Server address/),
    'https://jira.example.com/mcp',
  );
  await userEvent.type(screen.getByLabelText(/^Name/), 'Jira');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('How do people sign in?');
  await userEvent.click(screen.getByRole('button', { name: 'Add connector' }));
  await screen.findByText('Test the connection');
  return result;
}

function tool(name: string, readOnly: boolean, summary?: string): ToolSummary {
  return {
    name: `x_jira_${name}`,
    summary,
    annotations: readOnly ? { readOnlyHint: true } : {},
  };
}

const TOOLS: ToolSummary[] = [
  tool('search_issues', true, 'Find tickets with a query'),
  tool('get_issue', true),
  tool('list_projects', true),
  tool('add_comment', false, 'Write a comment on a ticket'),
  tool('transition_issue', false),
  tool('create_issue', false),
  tool('get_sprint', true),
  tool('list_boards', true),
];

describe('NewConnectorTestPage', () => {
  beforeEach(() => {
    mockMcpServers = [];
    jest.clearAllMocks();
    callTool.mockResolvedValue({});
    listServers.mockResolvedValue({ mcpServers: [] });
    getAuthStatus.mockResolvedValue({ servers: [] });
    filterTools.mockResolvedValue({
      total: 0,
      filtered_count: 0,
      truncated: false,
      tools: [],
    });
  });

  it('sends a deep link with nothing registered back to the Connect step', async () => {
    await renderWizard('/agent-platform/connectors/new/verify');

    expect(await screen.findByText('Connect an app')).toBeInTheDocument();
    expect(screen.queryByText('Test the connection')).not.toBeInTheDocument();
  });

  it('follows the connector while it is still connecting', async () => {
    await renderTestStep();

    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(
      screen.getByText(/waiting for muster to connect it/),
    ).toBeInTheDocument();
  });

  it('reports the connected verdict with the read/change counts and badges', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'jira', state: 'Connected', toolsCount: 8 }],
    });
    filterTools.mockResolvedValue({
      total: 8,
      filtered_count: 8,
      truncated: false,
      tools: TOOLS,
    });

    await renderTestStep();

    expect(
      await screen.findByText(
        /Jira offers 8 tools — 5 that read and 3 that change things\./,
      ),
    ).toBeInTheDocument();
    // Six tools preview, prefix-stripped, each with its effect badge.
    expect(screen.getByText('search_issues')).toBeInTheDocument();
    expect(screen.getByText('Find tickets with a query')).toBeInTheDocument();
    expect(screen.getAllByText('Reads')).toHaveLength(3);
    expect(screen.getAllByText('Changes things')).toHaveLength(3);
    expect(screen.queryByText('list_boards')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Show all 8 tools' }),
    );
    expect(screen.getByText('list_boards')).toBeInTheDocument();
    expect(screen.getAllByText('Reads')).toHaveLength(5);
    expect(
      screen.queryByRole('button', { name: /Show all/ }),
    ).not.toBeInTheDocument();
  });

  it('offers the one-time sign-in when the connector reports Auth Required', async () => {
    listServers.mockResolvedValue({
      mcpServers: [{ name: 'jira', state: 'Auth Required' }],
    });

    await renderTestStep();

    expect(
      await screen.findByText(
        "This connector needs your sign-in — that's normal",
      ),
    ).toBeInTheDocument();
  });

  it('says what failed when the connector does not connect', async () => {
    listServers.mockResolvedValue({
      mcpServers: [
        {
          name: 'jira',
          state: 'Failed',
          statusMessage: 'connection refused',
        },
      ],
    });

    await renderTestStep();

    expect(
      await screen.findByText('The connector is not connecting'),
    ).toBeInTheDocument();
    // In the status line and the failure explanation.
    expect(screen.getAllByText('connection refused').length).toBeGreaterThan(0);
  });
});

describe('toolCountsLine', () => {
  it('counts reads and changes, defaulting unannotated tools to "changes"', () => {
    expect(toolCountsLine(TOOLS)).toBe(
      '8 tools — 5 that read and 3 that change things',
    );
    expect(toolCountsLine([tool('get_issue', true)])).toBe(
      '1 tool — 1 that read and 0 that change things',
    );
  });
});
