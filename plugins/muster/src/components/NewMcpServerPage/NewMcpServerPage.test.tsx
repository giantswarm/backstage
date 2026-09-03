import { screen, waitFor } from '@testing-library/react';
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

// The wizard registers onto the section's active installation; the section
// providers (kubernetes reads, muster session) are irrelevant to the form.
// The session hook is what gates transport detection, so it reports an
// authenticated session here.
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
  }),
  useMusterSession: () => ({
    authenticated: true,
    connecting: false,
    connect: jest.fn(),
  }),
}));

// The servers manager pulls in the muster session machinery; the wizard's
// routing is what's under test here.
jest.mock('../McpServersPage', () => ({
  McpServersPage: () => <div>servers-list</div>,
}));

const callTool = jest.fn();

const musterApi = {
  callTool,
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

/** Waits out the URL debounce until the detect probe has fired. */
async function waitForDetectCall() {
  await waitFor(
    () =>
      expect(callTool).toHaveBeenCalledWith(
        'core_mcpserver_detect',
        expect.anything(),
        'gazelle',
      ),
    { timeout: 3000 },
  );
}

describe('NewMcpServerPage', () => {
  beforeEach(() => {
    callTool.mockReset();
    // Default: detection finds nothing actionable.
    callTool.mockResolvedValue({ transport: 'unknown', reachable: false });
  });

  it('renders the details step with its step label', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(screen.getByText('Register an MCP server')).toBeInTheDocument();
  });

  it('derives the technical name from the display name', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(screen.getByLabelText(/^Name/), 'Weather (remote)');

    expect(screen.getByLabelText(/Technical name/)).toHaveValue(
      'weather-remote',
    );
  });

  it('surfaces validation on Continue and stays on the step', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );

    expect(
      screen.getByText('Please fix the following before continuing'),
    ).toBeInTheDocument();
    expect(screen.getByText(/URL is required/)).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
  });

  it('continues to the authentication step once the details are valid', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(screen.getByLabelText(/^Name/), 'Weather');
    await userEvent.type(
      screen.getByLabelText(/^URL/),
      'https://weather.example.com/mcp',
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );

    expect(
      await screen.findByText('Step 2 of 4: Authentication'),
    ).toBeInTheDocument();
  });

  it('takes request metadata as NAME=value lines', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(
      screen.getByLabelText(/Request metadata/),
      'AWS_REGION=eu-central-1',
    );

    expect(screen.getByLabelText(/Request metadata/)).toHaveValue(
      'AWS_REGION=eu-central-1',
    );
  });

  it('flags request metadata the composed map would swallow', async () => {
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(screen.getByLabelText(/^Name/), 'Weather');
    await userEvent.type(
      screen.getByLabelText(/^URL/),
      'https://weather.example.com/mcp',
    );
    // A value with no name in front of it is dropped silently otherwise.
    await userEvent.type(
      screen.getByLabelText(/Request metadata/),
      '=eu-central-1',
    );
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Continue' })[0],
    );

    expect(
      screen.getByText(/Request metadata needs a name for every value/),
    ).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4: Details')).toBeInTheDocument();
  });

  it('pre-selects the detected transport once the URL is entered', async () => {
    callTool.mockResolvedValue({
      transport: 'sse',
      reachable: true,
      requiresAuth: false,
    });
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(
      screen.getByLabelText(/^URL/),
      'https://legacy.example.com/sse',
    );
    await waitForDetectCall();
    expect(callTool).toHaveBeenCalledWith(
      'core_mcpserver_detect',
      { url: 'https://legacy.example.com/sse' },
      'gazelle',
    );

    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Transport SSE' }),
      ).toBeChecked(),
    );
    expect(screen.getByText('Detected')).toBeInTheDocument();
  });

  it('keeps a manual transport choice as override after detection', async () => {
    callTool.mockResolvedValue({
      transport: 'sse',
      reachable: true,
      requiresAuth: false,
    });
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(
      screen.getByLabelText(/^URL/),
      'https://legacy.example.com/sse',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('radio', { name: 'Transport SSE' }),
      ).toBeChecked(),
    );

    // The user overrides the detection; the choice must stick while the
    // "Detected" affordance keeps marking what the probe found.
    await userEvent.click(
      screen.getByRole('radio', { name: 'Transport Streamable HTTP' }),
    );
    expect(
      screen.getByRole('radio', { name: 'Transport Streamable HTTP' }),
    ).toBeChecked();
    expect(screen.getByText('Detected')).toBeInTheDocument();
  });

  it('degrades silently to manual selection when detection is inconclusive', async () => {
    callTool.mockResolvedValue({ transport: 'unknown', reachable: false });
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(
      screen.getByLabelText(/^URL/),
      'https://unreachable.example.com/mcp',
    );
    await waitForDetectCall();

    // The default stays selected and nothing claims a detection.
    expect(
      screen.getByRole('radio', { name: 'Transport Streamable HTTP' }),
    ).toBeChecked();
    expect(screen.queryByText('Detected')).not.toBeInTheDocument();
  });

  it('degrades silently when the muster lacks the detect tool', async () => {
    callTool.mockRejectedValue(
      new Error('Tool execution failed: unknown tool: mcpserver_detect'),
    );
    await renderWizard('/agent-platform/muster/servers/new');

    await userEvent.type(
      screen.getByLabelText(/^URL/),
      'https://weather.example.com/mcp',
    );
    await waitForDetectCall();

    expect(
      screen.getByRole('radio', { name: 'Transport Streamable HTTP' }),
    ).toBeChecked();
    expect(screen.queryByText('Detected')).not.toBeInTheDocument();
  });
});
