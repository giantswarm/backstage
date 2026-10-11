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
    it('renders the in-content wizard frame with the three steps', async () => {
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

    it('marks the invalid fields themselves on Continue instead of moving on', async () => {
      await renderWizard('/agent-platform/connectors/new');

      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      const address = screen.getByLabelText(/^Server address/);
      expect(address).toHaveAttribute('aria-invalid', 'true');
      expect(address).toHaveAccessibleDescription(
        expect.stringContaining('Server address is required'),
      );
      // The first invalid field takes the focus.
      expect(address).toHaveFocus();
      const name = screen.getByRole('textbox', { name: /^Name/ });
      expect(name).toHaveAttribute('aria-invalid', 'true');
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining('Name is required'),
      );
      // Every problem has a field to show it, so no summary box.
      expect(
        screen.queryByText(/Fix before continuing/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('How do people sign in?'),
      ).not.toBeInTheDocument();
    });

    // Live round L5: the field is labelled "Server address", so its problems
    // say so — not the classic wizard's "URL".
    it('words the address problems after the field label', async () => {
      await renderWizard('/agent-platform/connectors/new');

      await userEvent.type(
        screen.getByLabelText(/^Server address/),
        'not a url',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      const address = screen.getByLabelText(/^Server address/);
      expect(address).toHaveAccessibleDescription(
        expect.stringContaining('Server address must be an http(s) URL'),
      );
      expect(address).not.toHaveAccessibleDescription(/^URL/);
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
        await screen.findByText(/Muster could not reach this address/),
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
        'Company login',
        'Each person signs in with their own account',
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

    it('starts a new connector on Company login, marked as recommended', async () => {
      await renderSignInStep();

      const sso = screen.getByRole('radio', { name: 'Company login' });
      expect(sso).toHaveAttribute('aria-checked', 'true');
      expect(within(sso).getByText(/^Recommended\./)).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'No sign-in' })).toHaveAttribute(
        'aria-checked',
        'false',
      );
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
      await userEvent.click(screen.getByRole('radio', { name: 'No sign-in' }));

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
        screen.getByText(
          "Advanced: sign-in settings for apps muster can't look up",
        ),
      );
      await userEvent.type(
        await screen.findByLabelText(/^Where people sign in \(issuer URL\)/),
        'https://github.com',
      );
      await userEvent.type(
        screen.getByLabelText(/^Permissions to ask for \(scopes\)/),
        'repo',
      );
      await userEvent.type(
        screen.getByLabelText(
          /^Sign-in page address \(authorization endpoint\)/,
        ),
        'https://github.com/login/oauth/authorize',
      );
      await userEvent.type(
        screen.getByLabelText(/^Token address \(token endpoint\)/),
        'https://github.com/login/oauth/access_token',
      );

      // The client credentials ask where the Secret is and which keys to read,
      // never for the credentials themselves.
      const credentials = screen.getByRole('group', {
        name: 'Client credentials — stored in a Kubernetes Secret',
      });
      expect(
        within(credentials).getByText(
          /never the client ID or secret themselves/,
        ),
      ).toBeInTheDocument();
      await userEvent.type(
        within(credentials).getByLabelText(/^Secret name(?!space)/),
        'github-oauth-client',
      );
      await userEvent.type(
        within(credentials).getByLabelText(/^Secret namespace/),
        'muster',
      );
      await userEvent.type(
        within(credentials).getByLabelText(/^Key holding the client ID/),
        'clientId',
      );
      await userEvent.type(
        within(credentials).getByLabelText(/^Key holding the client secret/),
        'clientSecret',
      );
      // The grant's lifetime in plain words, muster's term in parentheses.
      expect(
        screen.getAllByText(
          'Sign in again in every new session (session, default)',
        ).length,
      ).toBeGreaterThan(0);

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

    it('reopens the advanced settings around a field that blocks registration', async () => {
      await renderSignInStep();
      await userEvent.click(
        screen.getByRole('radio', {
          name: 'Each person signs in with their own account',
        }),
      );
      const advanced = () =>
        screen.getByText(
          "Advanced: sign-in settings for apps muster can't look up",
        );
      await userEvent.click(advanced());
      await userEvent.type(
        await screen.findByLabelText(/^Where people sign in \(issuer URL\)/),
        'http://not-https.example.com',
      );
      // Collapsed again: the issuer field is gone from the page.
      await userEvent.click(advanced());
      expect(
        screen.queryByLabelText(/^Where people sign in \(issuer URL\)/),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );

      const issuer = await screen.findByLabelText(
        /^Where people sign in \(issuer URL\)/,
      );
      expect(issuer).toHaveAttribute('aria-invalid', 'true');
      expect(issuer).toHaveAccessibleDescription(
        expect.stringContaining('Issuer must be an https URL'),
      );
      expect(issuer).toHaveFocus();
      expect(toolCalls('core_mcpserver_create')).toEqual([]);
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

      // The region is required: without it the submit marks the field.
      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      const region = screen.getByLabelText(/^Signing region/);
      expect(region).toHaveAttribute('aria-invalid', 'true');
      expect(region).toHaveAccessibleDescription(
        expect.stringContaining('Signing region is required'),
      );
      expect(region).toHaveFocus();
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

  describe('editing a registered connector', () => {
    const registered = () =>
      new MCPServer(
        {
          apiVersion: 'muster.giantswarm.io/v1alpha1',
          kind: 'MCPServer',
          metadata: { name: 'jira', namespace: 'muster' },
          spec: {
            type: 'streamable-http',
            url: 'https://jira.example.com/mcp',
            autoStart: true,
            description: 'Search, read and update tickets',
            auth: { type: 'oauth' },
          },
          status: { state: 'Connected' },
        } as never,
        'gazelle',
      );

    beforeEach(() => {
      mockMcpServers = [registered()];
    });

    it('opens the same wizard pre-filled, titled as an edit of the connector', async () => {
      await renderWizard('/agent-platform/connectors/new?edit=jira');

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Edit connector: jira',
        }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/^Server address/)).toHaveValue(
        'https://jira.example.com/mcp',
      );
      expect(screen.getByLabelText(/^What does it give access to/)).toHaveValue(
        'Search, read and update tickets',
      );
      // The registered name is the CR's: kept, not renamed.
      const name = screen.getByRole('textbox', { name: /^Name/ });
      expect(name).toHaveValue('jira');
      expect(name).toBeDisabled();
      // Leaving goes back to the connector's page, where Edit was pressed.
      expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute(
        'href',
        '/agent-platform/connectors/jira?installation=gazelle',
      );
    });

    it('marks the invalid fields themselves on Continue, as when adding', async () => {
      await renderWizard('/agent-platform/connectors/new?edit=jira');

      const address = await screen.findByLabelText(/^Server address/);
      await userEvent.clear(address);
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(address).toHaveAttribute('aria-invalid', 'true');
      expect(address).toHaveAccessibleDescription(
        expect.stringContaining('Server address is required'),
      );
      expect(address).toHaveFocus();
      expect(
        screen.queryByText('How do people sign in?'),
      ).not.toBeInTheDocument();
    });

    it('saves the changes as an update of the connector, never a second one', async () => {
      await renderWizard('/agent-platform/connectors/new?edit=jira');

      const address = await screen.findByLabelText(/^Server address/);
      await userEvent.clear(address);
      await userEvent.type(address, 'https://jira.internal/mcp');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByText('How do people sign in?');

      // The registered sign-in is the starting answer, not Company login.
      expect(
        screen.getByRole('radio', {
          name: 'Each person signs in with their own account',
        }),
      ).toHaveAttribute('aria-checked', 'true');
      expect(
        screen.queryByRole('button', { name: 'Add connector' }),
      ).not.toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'Save changes' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_update')).toEqual([
        [
          'core_mcpserver_update',
          expect.objectContaining({
            name: 'jira',
            url: 'https://jira.internal/mcp',
            auth: { type: 'oauth' },
          }),
          'gazelle',
        ],
      ]);
      expect(toolCalls('core_mcpserver_create')).toEqual([]);
      expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute(
        'href',
        '/agent-platform/connectors/jira?installation=gazelle',
      );
    });
  });

  it('closes a new registration to the connectors list', async () => {
    await renderWizard('/agent-platform/connectors/new');

    expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute(
      'href',
      '/agent-platform/connectors',
    );
  });
});
