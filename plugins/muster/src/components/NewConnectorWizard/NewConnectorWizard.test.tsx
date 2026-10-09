import { screen, within } from '@testing-library/react';
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

import { musterApiRef } from '../../apis';
import { mcpServersRouteRef } from '../../routes';
import { MCPServer } from '../../lib/k8s';
import type { TransportDetectionState } from '../NewMcpServerPage/useTransportDetection';
import { McpServersRouter } from '../McpServersRouter';

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

// The probe has its own tests (NewMcpServerPage.test.tsx); here its verdict is
// set per test so the inline "Server found" states render deterministically
// and the register flow's callTool assertions see no detect calls.
let mockDetection: TransportDetectionState = {
  detected: undefined,
  probing: false,
};
jest.mock('../NewMcpServerPage/useTransportDetection', () => ({
  useTransportDetection: () => mockDetection,
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
        {/* The frame's footer renders the actions the steps register, so the
            slot provider the shell's page routes mount is mounted here too. */}
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

/** Fills the Connect step and continues to Sign-in. */
async function renderSignInStep() {
  const result = await renderWizard('/agent-platform/connectors/new');
  await userEvent.type(
    screen.getByLabelText(/^Server address/),
    'https://jira.example.com/mcp',
  );
  await userEvent.type(screen.getByLabelText(/^Name/), 'Jira');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('How do people sign in?');
  return result;
}

/** The arguments of each `core_mcpserver_<tool>` call so far. */
function toolCalls(tool: string): unknown[][] {
  return callTool.mock.calls.filter(call => call[0] === tool);
}

describe('shell connector wizard', () => {
  beforeEach(() => {
    mockMcpServers = [];
    mockDetection = { detected: undefined, probing: false };
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

  describe('Connect step', () => {
    it('renders the full-screen frame with the three steps', async () => {
      await renderWizard('/agent-platform/connectors/new');

      expect(
        screen.getByRole('heading', { level: 1, name: 'Add connector' }),
      ).toBeInTheDocument();
      const strip = screen.getByRole('list', { name: 'Steps' });
      expect(
        within(strip)
          .getAllByRole('listitem')
          .map(item => item.textContent),
      ).toEqual(['1Connect', '2Sign-in', '3Test']);
      expect(screen.getByText('Connect an app')).toBeInTheDocument();
      // The prototype's audience choice has no muster equivalent, so the
      // wizard does not ask it.
      expect(screen.queryByText(/Who can use it/)).not.toBeInTheDocument();
    });

    it('surfaces the validation problems on Continue instead of moving on', async () => {
      await renderWizard('/agent-platform/connectors/new');

      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(
        await screen.findByText(/Please fix the following/),
      ).toBeInTheDocument();
      expect(screen.getByText(/Name is required/)).toBeInTheDocument();
      expect(screen.getByText(/URL is required/)).toBeInTheDocument();
      expect(
        screen.queryByText('How do people sign in?'),
      ).not.toBeInTheDocument();
    });

    it('shows the probe verdict as the inline "Server found" state', async () => {
      mockDetection = {
        detected: 'streamable-http',
        probing: false,
        probedUrl: 'https://jira.example.com/mcp',
        detection: {
          transport: 'streamable-http',
          reachable: true,
          requiresAuth: true,
          serverName: 'Jira MCP',
        },
      };
      await renderWizard('/agent-platform/connectors/new');
      await userEvent.type(
        screen.getByLabelText(/^Server address/),
        'https://jira.example.com/mcp',
      );

      expect(await screen.findByText('Server found')).toBeInTheDocument();
      expect(
        screen.getByText(/Jira MCP · Streamable HTTP · asks for a sign-in/),
      ).toBeInTheDocument();
    });

    it('says when the probe could not reach the address', async () => {
      mockDetection = {
        detected: undefined,
        probing: false,
        probedUrl: 'https://jira.example.com/mcp',
        detection: {
          transport: 'unknown',
          reachable: false,
          requiresAuth: false,
        },
      };
      await renderWizard('/agent-platform/connectors/new');
      await userEvent.type(
        screen.getByLabelText(/^Server address/),
        'https://jira.example.com/mcp',
      );

      expect(
        await screen.findByText(/No answer from this address/),
      ).toBeInTheDocument();
      expect(screen.queryByText('Server found')).not.toBeInTheDocument();
    });

    it('sends a sign-in deep link back while the connection details are incomplete', async () => {
      await renderWizard('/agent-platform/connectors/new/auth');

      expect(await screen.findByText('Connect an app')).toBeInTheDocument();
      expect(
        screen.queryByText('How do people sign in?'),
      ).not.toBeInTheDocument();
    });
  });

  describe('Sign-in step', () => {
    it('offers exactly the four decided modes, and none of the omitted ones', async () => {
      await renderSignInStep();

      const choices = screen.getAllByRole('radio');
      expect(choices.map(c => c.getAttribute('aria-label'))).toEqual([
        'Each person signs in with their own account',
        'Company login',
        'No sign-in',
        'AWS request signing (SigV4)',
      ]);
      // Decided against: token exchange, forwardIdentity and plaintext
      // credential headers never show up.
      expect(screen.queryByText(/token exchange/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/forwardIdentity/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/API key/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/API key/i)).not.toBeInTheDocument();
    });

    it('does not offer AWS request signing on a transport the CRD forbids', async () => {
      mockDetection = { detected: 'sse', probing: false };
      await renderSignInStep();

      expect(
        screen.queryByRole('radio', { name: 'AWS request signing (SigV4)' }),
      ).not.toBeInTheDocument();
    });

    it('registers a no-sign-in connector: validate, then create', async () => {
      await renderSignInStep();

      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      const expected = {
        name: 'jira',
        type: 'streamable-http',
        url: 'https://jira.example.com/mcp',
        autoStart: true,
      };
      expect(toolCalls('core_mcpserver_validate')).toEqual([
        ['core_mcpserver_validate', expected, 'gazelle'],
      ]);
      expect(toolCalls('core_mcpserver_create')).toEqual([
        ['core_mcpserver_create', expected, 'gazelle'],
      ]);
    });

    it('registers "own account" with the advanced override behind the disclosure', async () => {
      await renderSignInStep();
      await userEvent.click(
        screen.getByRole('radio', {
          name: 'Each person signs in with their own account',
        }),
      );

      // The callback URL to allowlist is stated before any advanced field.
      expect(
        screen.getByText('https://muster.gazelle.example.com/oauth/callback'),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByText('Advanced: authorization server override'),
      );
      await userEvent.type(
        await screen.findByLabelText(/^Issuer/),
        'https://github.com',
      );
      await userEvent.type(screen.getByLabelText(/^Scopes/), 'repo');
      await userEvent.type(
        screen.getByLabelText(/^Authorization endpoint/),
        'https://github.com/login/oauth/authorize',
      );
      await userEvent.type(
        screen.getByLabelText(/^Token endpoint/),
        'https://github.com/login/oauth/access_token',
      );
      await userEvent.type(
        screen.getByLabelText(/^Client credentials Secret/),
        'github-oauth-client',
      );
      await userEvent.type(
        screen.getByLabelText(/^Secret namespace/),
        'muster',
      );
      await userEvent.type(screen.getByLabelText(/^Client id key/), 'clientId');
      await userEvent.type(
        screen.getByLabelText(/^Client secret key/),
        'clientSecret',
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_create')[0][1]).toMatchObject({
        name: 'jira',
        auth: {
          type: 'oauth',
          authorizationServer: {
            issuer: 'https://github.com',
            scopes: 'repo',
            authorizationEndpoint: 'https://github.com/login/oauth/authorize',
            tokenEndpoint: 'https://github.com/login/oauth/access_token',
            clientCredentialsSecretRef: {
              name: 'github-oauth-client',
              namespace: 'muster',
              clientIdKey: 'clientId',
              clientSecretKey: 'clientSecret',
            },
          },
        },
      });
    });

    it('registers plain "own account" as oauth with discovery', async () => {
      await renderSignInStep();
      await userEvent.click(
        screen.getByRole('radio', {
          name: 'Each person signs in with their own account',
        }),
      );

      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_create')[0][1]).toMatchObject({
        auth: { type: 'oauth' },
      });
      expect(
        (toolCalls('core_mcpserver_create')[0][1] as { auth: object }).auth,
      ).not.toHaveProperty('authorizationServer');
    });

    it('registers Company login as forwardToken, with the restart caveat as help text', async () => {
      await renderSignInStep();
      await userEvent.click(
        screen.getByRole('radio', { name: 'Company login' }),
      );

      expect(
        screen.getByText(/takes effect only after muster restarts/),
      ).toBeInTheDocument();

      await userEvent.type(
        screen.getByLabelText(/Required audiences/),
        'jira-backend, dex',
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_create')[0][1]).toMatchObject({
        auth: {
          forwardToken: true,
          requiredAudiences: ['jira-backend', 'dex'],
        },
      });
    });

    it('registers AWS request signing as sigv4 and requires the region', async () => {
      await renderSignInStep();
      await userEvent.click(
        screen.getByRole('radio', { name: 'AWS request signing (SigV4)' }),
      );

      expect(
        screen.getByText('Every user shares one AWS identity'),
      ).toBeInTheDocument();

      // The region is required: without it the submit surfaces the problem.
      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      expect(
        await screen.findByText(/Signing region is required/),
      ).toBeInTheDocument();
      expect(toolCalls('core_mcpserver_create')).toEqual([]);

      await userEvent.type(
        screen.getByLabelText(/^Signing region/),
        'eu-central-1',
      );
      await userEvent.type(
        screen.getByLabelText(/^Signing service/),
        'aws-mcp',
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_create')[0][1]).toMatchObject({
        auth: {
          type: 'sigv4',
          sigv4: { region: 'eu-central-1', service: 'aws-mcp' },
        },
      });
    });
  });
});
