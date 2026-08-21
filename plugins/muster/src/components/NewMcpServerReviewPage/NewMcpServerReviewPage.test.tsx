import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';

import { musterApiRef } from '../../apis';
import { rootRouteRef } from '../../routes';
import { McpServersRouter } from '../McpServersRouter';

const connect = jest.fn();

jest.mock('../MusterInstanceProvider', () => ({
  useMusterInstance: () => ({
    installations: ['gazelle'],
    isLoadingInstallations: false,
    activeInstallation: 'gazelle',
    activeInstallationInfo: {
      name: 'gazelle',
      endpoint: 'https://muster.gazelle.example.com/mcp',
      requiresAuth: true,
    },
    setActiveInstallation: jest.fn(),
    mcpServers: [],
    retry: jest.fn(),
  }),
  useMusterSession: () => ({
    authenticated: true,
    connecting: false,
    connect,
  }),
}));

jest.mock('../McpServersPage', () => ({
  McpServersPage: () => <div>servers-list</div>,
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
        <Routes>
          <Route
            path="/agent-platform/muster/servers/*"
            element={<McpServersRouter />}
          />
        </Routes>
      </QueryClientProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/agent-platform/muster': rootRouteRef },
    },
  );
}

/** Walks the real flow: details → auth → review. */
async function renderReviewStep() {
  const result = await renderWizard('/agent-platform/muster/servers/new');
  await userEvent.type(screen.getByLabelText(/^Name/), 'Weather');
  await userEvent.type(
    screen.getByLabelText(/^URL/),
    'https://weather.example.com/mcp',
  );
  await userEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0]);
  await screen.findByText('Step 2 of 4: Authentication');
  await userEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0]);
  await screen.findByText('Step 3 of 4: Review & register');
  return result;
}

describe('NewMcpServerReviewPage', () => {
  beforeEach(() => {
    callTool.mockReset();
    listServers.mockReset();
    getAuthStatus.mockReset();
    filterTools.mockReset();
    listServers.mockResolvedValue({ mcpServers: [] });
    getAuthStatus.mockResolvedValue({ servers: [] });
    filterTools.mockResolvedValue({
      total: 0,
      filtered_count: 0,
      truncated: false,
      tools: [],
    });
  });

  it('sends a deep link back to step 1 while the form is incomplete', async () => {
    await renderWizard('/agent-platform/muster/servers/new/review');

    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(
      screen.queryByText('Step 3 of 4: Review & register'),
    ).not.toBeInTheDocument();
  });

  it('shows the summary, the generated definition and the manual fallback', async () => {
    await renderReviewStep();

    // Summary strip.
    expect(screen.getAllByText('weather').length).toBeGreaterThan(0);
    expect(screen.getAllByText('gazelle').length).toBeGreaterThan(0);
    expect(screen.getByText('No authentication')).toBeInTheDocument();

    // The definition passed to validate/create, as JSON.
    expect(screen.getByText(/"type": "streamable-http"/)).toBeInTheDocument();

    // Collapsed manual fallback: manifest + CLI command.
    expect(screen.getByText('Register manually instead')).toBeInTheDocument();
    expect(screen.getByText(/kind: MCPServer/)).toBeInTheDocument();
    expect(
      screen.getByText(/muster create mcpserver weather/),
    ).toBeInTheDocument();
  });

  it('validates (dry-run) before creating, then moves on to verify', async () => {
    callTool.mockResolvedValue({});
    await renderReviewStep();

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Register server' })[0],
    );

    await screen.findByText('Step 4 of 4: Verify');
    expect(callTool.mock.calls.map(c => c[0])).toEqual([
      'core_mcpserver_validate',
      'core_mcpserver_create',
    ]);
    // Same target: the composed definition, on the active installation.
    for (const call of callTool.mock.calls) {
      expect(call[1]).toMatchObject({
        name: 'weather',
        type: 'streamable-http',
        url: 'https://weather.example.com/mcp',
        autoStart: true,
      });
      expect(call[2]).toBe('gazelle');
    }
  });

  it("surfaces muster's validation refusal and writes nothing", async () => {
    callTool.mockRejectedValueOnce(
      new Error('validation failed: url is required'),
    );
    await renderReviewStep();

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Register server' })[0],
    );

    expect(
      await screen.findByText('validation failed: url is required'),
    ).toBeInTheDocument();
    expect(callTool).toHaveBeenCalledTimes(1);
    expect(callTool.mock.calls[0][0]).toBe('core_mcpserver_validate');
    expect(
      screen.getByText('Step 3 of 4: Review & register'),
    ).toBeInTheDocument();
  });

  it('loops back through the wizard as an update to the same CR, never a recreate', async () => {
    callTool.mockResolvedValue({});
    await renderReviewStep();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Register server' })[0],
    );
    await screen.findByText('Step 4 of 4: Verify');

    // "Edit details" returns to step 1 with the form intact…
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Edit details' })[0],
    );
    await screen.findByText('Step 1 of 4: Details');
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Weather');
    // …with the technical name locked to the registered CR.
    expect(screen.getByLabelText(/Technical name/)).toBeDisabled();

    // Walk forward again: the save is an update to the same name.
    callTool.mockClear();
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );
    await screen.findByText('Step 2 of 4: Authentication');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );
    await screen.findByText('Step 3 of 4: Review & register');

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Save changes' })[0],
    );
    await screen.findByText('Step 4 of 4: Verify');
    expect(callTool.mock.calls.map(c => c[0])).toEqual([
      'core_mcpserver_validate',
      'core_mcpserver_update',
    ]);
  });
});
