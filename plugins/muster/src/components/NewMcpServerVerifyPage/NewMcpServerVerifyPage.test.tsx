import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';

import { musterApiRef, type McpServerRuntime } from '../../apis';
import { rootRouteRef } from '../../routes';
import { McpServersRouter } from '../McpServersRouter';

const retry = jest.fn();

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
    retry,
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

// Transport detection on the details step would interleave extra callTool
// invocations with this flow's assertions; it has its own tests in
// NewMcpServerPage.test.tsx.
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

/** Walks the real flow to a registered server so the verify step has one. */
async function renderVerifyStep() {
  callTool.mockResolvedValue({});
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
  await userEvent.click(
    screen.getAllByRole('button', { name: 'Register server' })[0],
  );
  await screen.findByText('Step 4 of 4: Verify');
  return result;
}

function runtime(overrides: Partial<McpServerRuntime>): McpServerRuntime {
  return { name: 'weather', ...overrides };
}

describe('NewMcpServerVerifyPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    listServers.mockResolvedValue({ mcpServers: [] });
    getAuthStatus.mockResolvedValue({ servers: [] });
    filterTools.mockResolvedValue({
      total: 0,
      filtered_count: 0,
      truncated: false,
      tools: [],
    });
  });

  it('sends a deep link with nothing registered back to step 1', async () => {
    await renderWizard('/agent-platform/muster/servers/new/verify');

    expect(await screen.findByText('Step 1 of 4: Details')).toBeInTheDocument();
    expect(screen.queryByText('Step 4 of 4: Verify')).not.toBeInTheDocument();
  });

  it('says leaving is safe and waits without a timeout while the server appears', async () => {
    await renderVerifyStep();

    expect(screen.getByText(/You can leave at any time/)).toBeInTheDocument();
    expect(
      screen.getByText('Waiting for the server to appear…'),
    ).toBeInTheDocument();
    // A fresh CRD read was kicked so the panel doesn't idle on a stale list.
    expect(retry).toHaveBeenCalled();
  });

  /**
   * Regression: the server connects during exactly the window where the user
   * wanders off to another window or tab, and react-query skips interval
   * refetches for hidden tabs by default -- the panel silently froze on
   * "Waiting for the server to appear…" while the server was long Connected
   * (observed on gazelle, 2026-08-27). The poll must run in the background.
   *
   * fireEvent + fake timers on purpose: the poll interval only fires from a
   * timer, so the test controls the clock, and userEvent's async delays do not
   * mix with a faked clock.
   */
  it('keeps polling while the tab is hidden until the server appears', async () => {
    jest.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });

    try {
      callTool.mockResolvedValue({});
      await renderWizard('/agent-platform/muster/servers/new');
      fireEvent.change(screen.getByLabelText(/^Name/), {
        target: { value: 'Weather' },
      });
      fireEvent.change(screen.getByLabelText(/^URL/), {
        target: { value: 'https://weather.example.com/mcp' },
      });
      fireEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0]);
      await screen.findByText('Step 2 of 4: Authentication');
      fireEvent.click(screen.getAllByRole('button', { name: 'Continue' })[0]);
      await screen.findByText('Step 3 of 4: Review & register');
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Register server' })[0],
      );
      await screen.findByText('Step 4 of 4: Verify');

      expect(
        screen.getByText('Waiting for the server to appear…'),
      ).toBeInTheDocument();

      // The server connects while the tab is hidden; the next poll must pick
      // it up anyway.
      listServers.mockResolvedValue({
        mcpServers: [runtime({ state: 'Connected' })],
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(6_000);
      });

      expect(screen.getByText('Connected')).toBeInTheDocument();
    } finally {
      delete (document as Record<string, any>).visibilityState;
      jest.useRealTimers();
    }
  });

  it('shows live state, attribution and session tool count from the runtime list', async () => {
    listServers.mockResolvedValue({
      mcpServers: [
        runtime({
          state: 'Connected',
          statusMessage: 'Connected and healthy',
          toolsCount: 7,
          registeredBy: 'timo@giantswarm.io',
        }),
      ],
    });

    await renderVerifyStep();

    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Connected and healthy')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('timo@giantswarm.io')).toBeInTheDocument();
  });

  it('decodes a dex protobuf subject in the attribution, raw value as tooltip', async () => {
    listServers.mockResolvedValue({
      mcpServers: [
        runtime({
          state: 'Connected',
          registeredBy: 'CgUzMjQ4OBIRZ2lhbnRzd2FybS1naXRodWI',
        }),
      ],
    });

    await renderVerifyStep();

    const attribution = await screen.findByText('giantswarm-github user 32488');
    expect(attribution).toHaveAttribute(
      'title',
      'CgUzMjQ4OBIRZ2lhbnRzd2FybS1naXRodWI',
    );
  });

  it('prefers the registered-by email over the decoded subject', async () => {
    listServers.mockResolvedValue({
      mcpServers: [
        runtime({
          state: 'Connected',
          registeredBy: 'CgUzMjQ4OBIRZ2lhbnRzd2FybS1naXRodWI',
          registeredByEmail: 'timo@giantswarm.io',
        }),
      ],
    });

    await renderVerifyStep();

    const attribution = await screen.findByText('timo@giantswarm.io');
    expect(attribution).toHaveAttribute(
      'title',
      'CgUzMjQ4OBIRZ2lhbnRzd2FybS1naXRodWI',
    );
    expect(
      screen.queryByText('giantswarm-github user 32488'),
    ).not.toBeInTheDocument();
  });

  it('treats Auth Required as normal and offers the inline sign-in', async () => {
    listServers.mockResolvedValue({
      mcpServers: [runtime({ state: 'Auth Required', toolsCount: 0 })],
    });
    getAuthStatus.mockResolvedValue({
      servers: [{ name: 'weather', status: 'auth_required' }],
    });

    await renderVerifyStep();

    expect(
      await screen.findByText("This server needs your sign-in — that's normal"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Sign in' }),
    ).toBeInTheDocument();
    // Not presented as a failure.
    expect(
      screen.queryByText('The server is not connecting'),
    ).not.toBeInTheDocument();
  });

  it("surfaces muster's status message on failure and offers the edit loop", async () => {
    listServers.mockResolvedValue({
      mcpServers: [
        runtime({
          state: 'Failed',
          statusMessage: 'TLS handshake failed',
          error: 'x509: certificate signed by unknown authority',
          consecutiveFailures: 3,
        }),
      ],
    });

    await renderVerifyStep();

    expect(
      await screen.findByText('The server is not connecting'),
    ).toBeInTheDocument();
    // Appears in the status grid and again in the failure alert.
    expect(screen.getAllByText('TLS handshake failed').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getByText('x509: certificate signed by unknown authority'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Edit details' }).length,
    ).toBeGreaterThan(0);
  });

  it('resets the wizard when done', async () => {
    await renderVerifyStep();

    await userEvent.click(screen.getAllByRole('button', { name: 'Done' })[0]);

    expect(await screen.findByText('servers-list')).toBeInTheDocument();
  });
});
