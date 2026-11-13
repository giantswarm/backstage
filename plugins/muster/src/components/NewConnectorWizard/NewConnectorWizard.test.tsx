import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  renderInTestApp,
  TestApiProvider,
} from '@backstage/frontend-test-utils';
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

// The muster providers, whose instance the mock below stands for.
// The router's own query client is the module-level one; the test's fresh
// client above it stands in for it, so each test reads afresh.
jest.mock('../QueryClientProvider', () => ({
  ...jest.requireActual('../QueryClientProvider'),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('../MusterSubPage', () => ({
  MusterSubPage: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

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

// The probe has its own tests (lib/transportDetection); here its verdict is
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
const describeTool = jest.fn();

const musterApi = {
  callTool,
  listServers,
  getAuthStatus,
  filterTools,
  describeTool,
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
              path="/customize/connectors/*"
              element={<McpServersRouter />}
            />
          </Routes>
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/customize/connectors': mcpServersRouteRef },
    },
  );
}

/** Fills the Connect step and continues to Sign-in. */
async function renderSignInStep() {
  const result = await renderWizard('/customize/connectors/new');
  await userEvent.type(
    screen.getByLabelText(/^Server address/),
    'https://jira.example.com/mcp',
  );
  await userEvent.type(screen.getByLabelText(/^Name/), 'Jira');
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByText('How do people sign in?');
  return result;
}

/**
 * `describe_tool` of a muster whose create and update take a display name
 * (v5.43.0 and later) or not, and a client to store (giantswarm/muster#1737)
 * unless `client` is false.
 */
function musterTakesDisplayName(
  takes: boolean,
  { client = true }: { client?: boolean } = {},
) {
  describeTool.mockImplementation((name: string) =>
    Promise.resolve({
      name,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          ...(takes ? { displayName: { type: 'string' } } : {}),
          ...(client && name !== 'core_mcpserver_validate'
            ? { clientCredentials: { type: 'object' } }
            : {}),
        },
      },
    }),
  );
}

/** `describe_tool` of a muster whose create and update take tags too. */
function musterTakesTags() {
  describeTool.mockImplementation((name: string) =>
    Promise.resolve({
      name,
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          displayName: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    }),
  );
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
    musterTakesDisplayName(true);
  });

  describe('Connect step', () => {
    it('renders the in-content wizard frame with the three steps', async () => {
      await renderWizard('/customize/connectors/new');

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
      await renderWizard('/customize/connectors/new');

      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      const address = screen.getByLabelText(/^Server address/);
      expect(address).toHaveAttribute('aria-invalid', 'true');
      expect(address).toHaveAccessibleDescription(
        expect.stringContaining('Enter the server address'),
      );
      // The first invalid field takes the focus.
      expect(address).toHaveFocus();
      const name = screen.getByRole('textbox', { name: /^Name/ });
      expect(name).toHaveAttribute('aria-invalid', 'true');
      expect(name).toHaveAccessibleDescription(
        expect.stringContaining('Enter a name for the connector.'),
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
    // say so — not the validator's "URL".
    it('words the address problems after the field label', async () => {
      await renderWizard('/customize/connectors/new');

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

    it('checks the address when the person leaves it, and clears the error once it is fixed', async () => {
      await renderWizard('/customize/connectors/new');
      const address = screen.getByLabelText(/^Server address/);

      await userEvent.type(address, 'mcp.example.com');
      expect(address).not.toHaveAttribute('aria-invalid');

      await userEvent.tab();
      expect(address).toHaveAccessibleDescription(
        expect.stringContaining('Server address must be an http(s) URL'),
      );

      await userEvent.clear(address);
      await userEvent.type(address, 'https://mcp.example.com/mcp');
      expect(address).not.toHaveAttribute('aria-invalid');
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
      await renderWizard('/customize/connectors/new');
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
      await renderWizard('/customize/connectors/new');
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
      await renderWizard('/customize/connectors/new/auth');

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
        displayName: 'Jira',
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

    it('keeps the typed name as the display name, registered under the derived one', async () => {
      await renderWizard('/customize/connectors/new');
      await userEvent.type(
        screen.getByLabelText(/^Server address/),
        'https://stackoverflow.example.com/mcp',
      );
      await userEvent.type(screen.getByLabelText(/^Name/), 'Stack Overflow');
      // The create form is as it was: the derived name is said under the field.
      expect(screen.getByText(/^Registered as/)).toHaveTextContent(
        'Registered as stack-overflow — used in its tool names.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('radio', { name: 'No sign-in' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_create')[0][1]).toMatchObject({
        name: 'stack-overflow',
        displayName: 'Stack Overflow',
      });
    });

    it('sends no display name for a plain id', async () => {
      await renderWizard('/customize/connectors/new');
      await userEvent.type(
        screen.getByLabelText(/^Server address/),
        'https://jira.example.com/mcp',
      );
      await userEvent.type(screen.getByLabelText(/^Name/), 'jira');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('radio', { name: 'No sign-in' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_create')[0][1]).not.toHaveProperty(
        'displayName',
      );
    });

    it('registers as before on a muster that takes no display name', async () => {
      musterTakesDisplayName(false);
      await renderSignInStep();
      await userEvent.click(screen.getByRole('radio', { name: 'No sign-in' }));

      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      for (const tool of ['core_mcpserver_validate', 'core_mcpserver_create']) {
        expect(toolCalls(tool)[0][1]).toEqual({
          name: 'jira',
          type: 'streamable-http',
          url: 'https://jira.example.com/mcp',
          autoStart: true,
        });
      }
    });

    it('asks for no tags on a muster that does not take them', async () => {
      await renderWizard('/customize/connectors/new');
      await screen.findByLabelText(/^Server address/);
      await waitFor(() => expect(describeTool).toHaveBeenCalled());

      expect(screen.queryByRole('textbox', { name: /^Tags/ })).toBeNull();
    });

    it('registers the tags added, normalized, where muster takes them', async () => {
      musterTakesTags();
      mockMcpServers = [
        new MCPServer(
          {
            apiVersion: 'muster.giantswarm.io/v1alpha1',
            kind: 'MCPServer',
            metadata: {
              name: 'pagerduty',
              annotations: { 'ui.giantswarm.io/tags': 'ops' },
            },
            spec: { type: 'streamable-http', url: 'https://pd.example/mcp' },
          } as never,
          'gazelle',
        ),
      ];
      await renderWizard('/customize/connectors/new');
      await userEvent.type(
        screen.getByLabelText(/^Server address/),
        'https://jira.example.com/mcp',
      );
      await userEvent.type(screen.getByLabelText(/^Name/), 'Jira');
      const tags = await screen.findByRole('textbox', { name: /^Tags/ });
      // The installation's connectors' tags are offered while typing.
      await userEvent.type(tags, 'op');
      expect(
        within(screen.getByRole('grid', { name: 'Suggested tags' })).getByText(
          'ops',
        ),
      ).toBeInTheDocument();
      await userEvent.clear(tags);
      await userEvent.type(tags, 'Ticket Triage, ops{Enter}');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('radio', { name: 'No sign-in' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_create')[0][1]).toMatchObject({
        tags: ['ticket-triage', 'ops'],
      });
    });

    it('adds a typed tag on Continue, as the agent form does', async () => {
      musterTakesTags();
      await renderWizard('/customize/connectors/new');
      await userEvent.type(
        screen.getByLabelText(/^Server address/),
        'https://jira.example.com/mcp',
      );
      await userEvent.type(screen.getByLabelText(/^Name/), 'Jira');
      await userEvent.type(
        await screen.findByRole('textbox', { name: /^Tags/ }),
        'Ticket Triage',
      );
      // Pressed without the field losing focus first, so its blur adds nothing.
      fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('radio', { name: 'No sign-in' }),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_create')[0][1]).toMatchObject({
        tags: ['ticket-triage'],
      });
    });

    it('keeps Continue from a typed tag that cannot be one', async () => {
      musterTakesTags();
      await renderWizard('/customize/connectors/new');
      await userEvent.type(
        screen.getByLabelText(/^Server address/),
        'https://jira.example.com/mcp',
      );
      await userEvent.type(screen.getByLabelText(/^Name/), 'Jira');
      await userEvent.type(
        await screen.findByRole('textbox', { name: /^Tags/ }),
        '!!',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(
        await screen.findByText('Use letters and numbers.'),
      ).toBeInTheDocument();
      expect(screen.queryByText('How do people sign in?')).toBeNull();
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
          "Advanced: sign-in settings for apps Muster can't look up",
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

      // An existing Secret is named by where it is and which keys to read.
      const credentials = screen.getByRole('group', {
        name: 'Client credentials',
      });
      await userEvent.click(
        within(credentials).getByRole('radio', { name: 'Existing Secret' }),
      );
      expect(
        within(credentials).queryByLabelText(/^Client ID/),
      ).not.toBeInTheDocument();
      // It is a Kubernetes Secret, of the type muster writes itself, and
      // empty key fields mean the keys their placeholders show.
      expect(
        within(credentials).getByText(
          /^Name a Kubernetes Secret of type Opaque that holds the client ID and secret in its data, by default under the keys client-id and client-secret\. Whoever saves the connector must be allowed to get this Secret\.$/,
        ),
      ).toBeInTheDocument();
      expect(
        within(credentials).getByLabelText(
          /^Key in the Secret's data that holds the client ID/,
        ),
      ).toHaveAttribute('placeholder', 'client-id');
      expect(
        within(credentials).getByLabelText(
          /^Key in the Secret's data that holds the client secret/,
        ),
      ).toHaveAttribute('placeholder', 'client-secret');
      await userEvent.type(
        within(credentials).getByLabelText(/^Secret name(?!space)/),
        'github-oauth-client',
      );
      await userEvent.type(
        within(credentials).getByLabelText(/^Secret namespace/),
        'muster',
      );
      await userEvent.type(
        within(credentials).getByLabelText(
          /^Key in the Secret's data that holds the client ID/,
        ),
        'clientId',
      );
      await userEvent.type(
        within(credentials).getByLabelText(
          /^Key in the Secret's data that holds the client secret/,
        ),
        'clientSecret',
      );
      // With an issuer, one sign-in serves every session by default.
      expect(
        screen.getByRole('radio', {
          name: 'Once, for the portal and every agent conversation (subject)',
        }),
      ).toBeChecked();

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
            grantScope: 'subject',
          },
        },
      });
    });

    describe('an existing Secret', () => {
      /** Own account, an issuer, Existing Secret: its fields on screen. */
      async function openExistingSecret() {
        await renderSignInStep();
        await userEvent.click(
          screen.getByRole('radio', {
            name: 'Each person signs in with their own account',
          }),
        );
        await userEvent.click(
          screen.getByText(
            "Advanced: sign-in settings for apps Muster can't look up",
          ),
        );
        await userEvent.type(
          await screen.findByLabelText(/^Where people sign in \(issuer URL\)/),
          'https://github.com',
        );
        const credentials = screen.getByRole('group', {
          name: 'Client credentials',
        });
        await userEvent.click(
          within(credentials).getByRole('radio', { name: 'Existing Secret' }),
        );
        return {
          credentials,
          name: within(credentials).getByLabelText(/^Secret name(?!space)/),
          namespace: within(credentials).getByLabelText(/^Secret namespace/),
          idKey: within(credentials).getByLabelText(
            /^Key in the Secret's data that holds the client ID/,
          ),
          secretKey: within(credentials).getByLabelText(
            /^Key in the Secret's data that holds the client secret/,
          ),
        };
      }

      const NAME_RULE =
        'Use lowercase letters, numbers, hyphens and dots, starting and ending with a letter or number (at most 253 characters), e.g. github-oauth-client.';
      const NAMESPACE_RULE =
        'Use lowercase letters, numbers and hyphens, starting and ending with a letter or number (at most 63 characters), e.g. muster.';

      it('checks the Secret name as a Kubernetes name on leaving it, not while it is typed', async () => {
        const { credentials, name } = await openExistingSecret();

        await userEvent.type(name, 'github oauth');
        expect(
          within(credentials).queryByText(NAME_RULE),
        ).not.toBeInTheDocument();

        await userEvent.tab();
        expect(
          await within(credentials).findByText(NAME_RULE),
        ).toBeInTheDocument();
        expect(name).toHaveAttribute('aria-invalid', 'true');

        // Fixed, the error goes at once.
        await userEvent.clear(name);
        await userEvent.type(name, 'github-oauth');
        expect(
          within(credentials).queryByText(NAME_RULE),
        ).not.toBeInTheDocument();
        expect(name).not.toHaveAttribute('aria-invalid', 'true');
      });

      it('checks the namespace and the keys on leaving them', async () => {
        const { credentials, namespace, idKey, secretKey } =
          await openExistingSecret();

        await userEvent.type(namespace, 'My_Namespace');
        await userEvent.tab();
        expect(
          await within(credentials).findByText(NAMESPACE_RULE),
        ).toBeInTheDocument();

        await userEvent.type(idKey, 'client id');
        await userEvent.tab();
        expect(
          await within(credentials).findByText(
            'Use letters, numbers, hyphens, underscores and dots (at most 253 characters, not starting with two dots), e.g. client-id.',
          ),
        ).toBeInTheDocument();

        await userEvent.type(secretKey, 'client/secret');
        await userEvent.tab();
        expect(
          await within(credentials).findByText(
            'Use letters, numbers, hyphens, underscores and dots (at most 253 characters, not starting with two dots), e.g. client-secret.',
          ),
        ).toBeInTheDocument();
      });

      it('leaves empty optional fields alone when tabbing through them', async () => {
        const { credentials, name } = await openExistingSecret();
        name.focus();
        await userEvent.tab();
        await userEvent.tab();
        await userEvent.tab();
        await userEvent.tab();
        expect(
          within(credentials).queryByText(
            "Enter the Secret's name, e.g. github-oauth-client.",
          ),
        ).not.toBeInTheDocument();
        expect(
          within(credentials).queryByText(NAMESPACE_RULE),
        ).not.toBeInTheDocument();
      });

      it('runs the same checks on save, showing each error on its field and focusing the first', async () => {
        const { name, namespace, idKey } = await openExistingSecret();
        await userEvent.type(name, 'GitHub Client');
        await userEvent.type(namespace, '-muster');
        // Not left by the person: only the save shows its problem.
        await userEvent.type(idKey, 'id?');

        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        // A blocked save remounts the disclosure open around its fields.
        const credentials = await screen.findByRole('group', {
          name: 'Client credentials',
        });

        expect(
          await within(credentials).findByText(NAME_RULE),
        ).toBeInTheDocument();
        expect(
          within(credentials).getByText(NAMESPACE_RULE),
        ).toBeInTheDocument();
        expect(
          within(credentials).getByText(
            'Use letters, numbers, hyphens, underscores and dots (at most 253 characters, not starting with two dots), e.g. client-id.',
          ),
        ).toBeInTheDocument();
        await waitFor(() =>
          expect(screen.getByLabelText(/^Secret name(?!space)/)).toHaveFocus(),
        );
        expect(toolCalls('core_mcpserver_create')).toEqual([]);
      });

      it('saves with Existing Secret left empty, as no client', async () => {
        await openExistingSecret();

        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        await screen.findByText('Test the connection');

        expect(
          (
            toolCalls('core_mcpserver_create')[0][1] as {
              auth: { authorizationServer: object };
            }
          ).auth.authorizationServer,
        ).not.toHaveProperty('clientCredentialsSecretRef');
      });

      it('sends the default keys by sending none, and trims what was typed', async () => {
        const { name } = await openExistingSecret();
        await userEvent.type(name, ' github-oauth-client ');

        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        await screen.findByText('Test the connection');

        const call = toolCalls('core_mcpserver_create')[0][1] as {
          auth: {
            authorizationServer: { clientCredentialsSecretRef: object };
          };
        };
        expect(
          call.auth.authorizationServer.clientCredentialsSecretRef,
        ).toEqual({ name: 'github-oauth-client' });
      });
    });

    describe('client credentials typed into the wizard', () => {
      const ISSUER = 'https://app.hubspot.com';

      /** Sign-in with own account, an issuer and the typed client. */
      async function typeClient(clientId: string, clientSecret: string) {
        await userEvent.click(
          screen.getByRole('radio', {
            name: 'Each person signs in with their own account',
          }),
        );
        await userEvent.click(
          screen.getByText(
            "Advanced: sign-in settings for apps Muster can't look up",
          ),
        );
        await userEvent.type(
          await screen.findByLabelText(/^Where people sign in \(issuer URL\)/),
          ISSUER,
        );
        const credentials = screen.getByRole('group', {
          name: 'Client credentials',
        });
        if (clientId) {
          await userEvent.type(
            within(credentials).getByLabelText(/^Client ID/),
            clientId,
          );
        }
        if (clientSecret) {
          await userEvent.type(
            within(credentials).getByLabelText(/^Client secret/),
            clientSecret,
          );
        }
        return credentials;
      }

      it('asks for the client ID and a masked secret, without autofill', async () => {
        await renderSignInStep();
        const credentials = await typeClient('', '');

        const id = within(credentials).getByLabelText(/^Client ID/);
        const secret = within(credentials).getByLabelText(/^Client secret/);
        expect(id).toHaveAttribute('autocomplete', 'off');
        expect(secret).toHaveAttribute('type', 'password');
        expect(secret).toHaveAttribute('autocomplete', 'new-password');
        // New secret is the default; the Secret fields wait behind
        // Existing Secret.
        expect(
          within(credentials).getByRole('radio', { name: 'New Secret' }),
        ).toBeChecked();
        expect(
          within(credentials).queryByLabelText(/^Secret name/),
        ).not.toBeInTheDocument();
        // Says where the client goes, in Kubernetes terms.
        expect(
          within(credentials).getByText(
            'When you enter a client, Muster stores it in a new Kubernetes Secret of type Opaque, which belongs to the connector and is deleted with it.',
          ),
        ).toBeInTheDocument();
        expect(
          within(credentials).getByText('It cannot be read back once saved.'),
        ).toBeInTheDocument();
      });

      it('keeps what was typed on either side for the way back, except the client secret', async () => {
        await renderSignInStep();
        const credentials = await typeClient(
          'hubspot-client',
          'hubspot-s3cret',
        );

        await userEvent.click(
          within(credentials).getByRole('radio', { name: 'Existing Secret' }),
        );
        await userEvent.type(
          within(credentials).getByLabelText(/^Secret name(?!space)/),
          'hubspot-oauth-client',
        );
        await userEvent.type(
          within(credentials).getByLabelText(
            /^Key in the Secret's data that holds the client ID/,
          ),
          'id',
        );
        await userEvent.click(
          within(credentials).getByRole('radio', { name: 'New Secret' }),
        );

        // The client ID comes back; a typed secret is never kept out of sight.
        expect(within(credentials).getByLabelText(/^Client ID/)).toHaveValue(
          'hubspot-client',
        );
        expect(
          within(credentials).getByLabelText(/^Client secret/),
        ).toHaveValue('');
        await userEvent.click(
          within(credentials).getByRole('radio', { name: 'Existing Secret' }),
        );
        expect(
          within(credentials).getByLabelText(/^Secret name(?!space)/),
        ).toHaveValue('hubspot-oauth-client');
        expect(
          within(credentials).getByLabelText(
            /^Key in the Secret's data that holds the client ID/,
          ),
        ).toHaveValue('id');

        // Only the chosen side is sent: the Secret, no typed client.
        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        await screen.findByText('Test the connection');
        const [create] = toolCalls('core_mcpserver_create');
        expect(create[1]).not.toHaveProperty('clientCredentials');
        expect(create[1]).toMatchObject({
          auth: {
            authorizationServer: {
              clientCredentialsSecretRef: {
                name: 'hubspot-oauth-client',
                clientIdKey: 'id',
              },
            },
          },
        });
      });

      it('composes no Secret typed under Existing Secret once New Secret is chosen', async () => {
        await renderSignInStep();
        const credentials = await typeClient('', '');
        await userEvent.click(
          within(credentials).getByRole('radio', { name: 'Existing Secret' }),
        );
        await userEvent.type(
          within(credentials).getByLabelText(/^Secret name(?!space)/),
          'hubspot-oauth-client',
        );
        await userEvent.click(
          within(credentials).getByRole('radio', { name: 'New Secret' }),
        );

        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        await screen.findByText('Test the connection');
        expect(
          (
            toolCalls('core_mcpserver_create')[0][1] as {
              auth: { authorizationServer: object };
            }
          ).auth.authorizationServer,
        ).not.toHaveProperty('clientCredentialsSecretRef');
      });

      it('offers no client fields on a muster that cannot store a client', async () => {
        musterTakesDisplayName(true, { client: false });
        await renderSignInStep();
        const credentials = await typeClient('', '');

        expect(
          await within(credentials).findByText(
            'Muster on this installation cannot store a client yet. To use your own client, choose Existing Secret and name a Secret that holds it.',
          ),
        ).toBeInTheDocument();
        expect(
          within(credentials).queryByLabelText(/^Client ID/),
        ).not.toBeInTheDocument();
        // Existing Secret still works, and the save goes through without one.
        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        await screen.findByText('Test the connection');
        expect(toolCalls('core_mcpserver_create')[0][1]).not.toHaveProperty(
          'clientCredentials',
        );
      });

      it('lists issuer, endpoints and scopes in that order, scopes never greyed out', async () => {
        await renderSignInStep();
        await userEvent.click(
          screen.getByRole('radio', {
            name: 'Each person signs in with their own account',
          }),
        );
        await userEvent.click(
          screen.getByText(
            "Advanced: sign-in settings for apps Muster can't look up",
          ),
        );
        const scopes = await screen.findByLabelText(
          /^Permissions to ask for \(scopes\)/,
        );
        expect(scopes).toBeEnabled();
        expect(scopes).toHaveValue('');
        expect(scopes).toHaveAttribute('placeholder', 'e.g. read write');
        expect(scopes).toHaveAccessibleDescription(
          'Separated by spaces. Needs an issuer.',
        );
        const order = [
          /^Where people sign in \(issuer URL\)/,
          /^Sign-in page address \(authorization endpoint\)/,
          /^Token address \(token endpoint\)/,
          /^Permissions to ask for \(scopes\)/,
        ].map(label => screen.getByLabelText(label));
        for (let i = 1; i < order.length; i++) {
          expect(
            order[i - 1].compareDocumentPosition(order[i]) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy();
        }
        // The client group follows them, its source choice first.
        const credentials = screen.getByRole('group', {
          name: 'Client credentials',
        });
        expect(
          order[3].compareDocumentPosition(credentials) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
        expect(
          within(credentials)
            .getAllByRole('radio')
            .map(radio => radio.getAttribute('value')),
        ).toEqual(['new', 'existing']);
      });

      it('drops the typed values when another sign-in mode is picked', async () => {
        await renderSignInStep();
        await typeClient('hubspot-client', 'hubspot-s3cret');

        await userEvent.click(
          screen.getByRole('radio', { name: 'No sign-in' }),
        );
        await userEvent.click(
          screen.getByRole('radio', {
            name: 'Each person signs in with their own account',
          }),
        );
        await userEvent.click(
          screen.getByText(
            "Advanced: sign-in settings for apps Muster can't look up",
          ),
        );
        const credentials = screen.getByRole('group', {
          name: 'Client credentials',
        });
        expect(within(credentials).getByLabelText(/^Client ID/)).toHaveValue(
          '',
        );
        expect(
          within(credentials).getByLabelText(/^Client secret/),
        ).toHaveValue('');
      });

      it('sends the client to create only, never to validate', async () => {
        await renderSignInStep();
        await typeClient('hubspot-client', 'hubspot-s3cret');

        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        await screen.findByText('Test the connection');

        const [validate] = toolCalls('core_mcpserver_validate');
        expect(JSON.stringify(validate)).not.toContain('hubspot-s3cret');
        expect(validate[1]).not.toHaveProperty('clientCredentials');
        const [create] = toolCalls('core_mcpserver_create');
        expect(create[1]).toMatchObject({
          name: 'jira',
          auth: { type: 'oauth', authorizationServer: { issuer: ISSUER } },
          clientCredentials: {
            clientId: 'hubspot-client',
            clientSecret: 'hubspot-s3cret',
          },
        });
        expect(
          (create[1] as { auth: { authorizationServer: object } }).auth
            .authorizationServer,
        ).not.toHaveProperty('clientCredentialsSecretRef');
      });

      it('shows the client as stored after the save, and a correction keeps it', async () => {
        await renderSignInStep();
        await typeClient('hubspot-client', 'hubspot-s3cret');
        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        await screen.findByText('Test the connection');

        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
        await screen.findByText('How do people sign in?');
        const credentials = screen.getByRole('group', {
          name: 'Client credentials',
        });
        expect(
          within(credentials).getByText('Client secret stored'),
        ).toBeInTheDocument();
        expect(
          within(credentials).queryByLabelText(/^Client secret/),
        ).not.toBeInTheDocument();

        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        await screen.findByText('Test the connection');
        const [update] = toolCalls('core_mcpserver_update');
        expect(JSON.stringify(update)).not.toContain('hubspot-s3cret');
        expect(update[1]).not.toHaveProperty('clientCredentials');
        // No reference either: muster keeps the client it stored.
        expect(
          (update[1] as { auth: { authorizationServer: object } }).auth
            .authorizationServer,
        ).toEqual({ issuer: ISSUER, grantScope: 'subject' });
      });

      it('asks for the other value and an issuer before saving half a client', async () => {
        await renderSignInStep();
        await userEvent.click(
          screen.getByRole('radio', {
            name: 'Each person signs in with their own account',
          }),
        );
        await userEvent.click(
          screen.getByText(
            "Advanced: sign-in settings for apps Muster can't look up",
          ),
        );
        await userEvent.type(
          await screen.findByLabelText(/^Client ID/),
          'hubspot-client',
        );
        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );

        expect(
          await screen.findByText('Enter the client secret too.'),
        ).toBeInTheDocument();
        expect(screen.getByText('Enter an issuer too.')).toBeInTheDocument();
        expect(callTool).not.toHaveBeenCalled();
      });

      it("shows muster's refusal, stays on the step and keeps the values for the retry", async () => {
        const refusal =
          'Permission denied: your user may not create Secret jira-muster-client-ab12c3d4e5 in namespace muster. Ask a platform admin to grant you the mcpserver-editor role.';
        callTool.mockImplementation((tool: string) =>
          tool === 'core_mcpserver_create'
            ? Promise.reject(new Error(refusal))
            : Promise.resolve({}),
        );
        await renderSignInStep();
        const credentials = await typeClient(
          'hubspot-client',
          'hubspot-s3cret',
        );

        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );

        expect(await screen.findByText(refusal)).toBeInTheDocument();
        expect(
          screen.getByText('Could not add the connector'),
        ).toBeInTheDocument();
        // muster rolled the connector back: nothing to test, nothing to edit.
        expect(
          screen.queryByText('Test the connection'),
        ).not.toBeInTheDocument();
        expect(screen.getByText('How do people sign in?')).toBeInTheDocument();
        // A failed save keeps what was typed (the forms skill).
        expect(
          within(credentials).getByLabelText(/^Client secret/),
        ).toHaveValue('hubspot-s3cret');
        expect(within(credentials).getByLabelText(/^Client ID/)).toHaveValue(
          'hubspot-client',
        );
        // The next attempt is a create again, with the client.
        callTool.mockResolvedValue({});
        await userEvent.click(
          screen.getByRole('button', { name: 'Add connector' }),
        );
        await screen.findByText('Test the connection');
        expect(toolCalls('core_mcpserver_update')).toEqual([]);
        expect(toolCalls('core_mcpserver_create')[1][1]).toMatchObject({
          clientCredentials: {
            clientId: 'hubspot-client',
            clientSecret: 'hubspot-s3cret',
          },
        });
      });
    });

    it('asks how often people sign in outside the advanced settings, saying what a session sign-in means for agents', async () => {
      await renderSignInStep();
      await userEvent.click(
        screen.getByRole('radio', {
          name: 'Each person signs in with their own account',
        }),
      );

      // Without an issuer muster can only file the sign-in per session: the
      // choice shows it, disabled, and says what lifts it.
      const once = screen.getByRole('radio', {
        name: 'Once, for the portal and every agent conversation (subject)',
      });
      const again = screen.getByRole('radio', {
        name: 'Again in every conversation (session)',
      });
      expect(again).toBeChecked();
      expect(once).toBeDisabled();
      expect(
        screen.getByText(/needs the app's issuer URL/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Agents will ask you to sign in again in every conversation.',
        ),
      ).toBeInTheDocument();

      // An issuer makes one sign-in the default, and the warning goes.
      await userEvent.click(
        screen.getByText(
          "Advanced: sign-in settings for apps Muster can't look up",
        ),
      );
      await userEvent.type(
        await screen.findByLabelText(/^Where people sign in \(issuer URL\)/),
        'https://auth.example.com',
      );
      expect(once).toBeEnabled();
      expect(once).toBeChecked();
      expect(
        screen.queryByText(
          'Agents will ask you to sign in again in every conversation.',
        ),
      ).not.toBeInTheDocument();

      // Picking a session sign-in on purpose brings it back.
      await userEvent.click(again);
      expect(
        screen.getByText(
          'Agents will ask you to sign in again in every conversation.',
        ),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Add connector' }),
      );
      await screen.findByText('Test the connection');
      // `session` is muster's default, so it is not spelled out.
      expect(toolCalls('core_mcpserver_create')[0][1]).toMatchObject({
        auth: {
          type: 'oauth',
          authorizationServer: { issuer: 'https://auth.example.com' },
        },
      });
      expect(
        (
          toolCalls('core_mcpserver_create')[0][1] as {
            auth: { authorizationServer: object };
          }
        ).auth.authorizationServer,
      ).not.toHaveProperty('grantScope');
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
          "Advanced: sign-in settings for apps Muster can't look up",
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
        screen.getByText(/takes effect only after Muster restarts/),
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
        expect.stringContaining('Enter the signing region'),
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
    const registered = (auth: Record<string, unknown> = { type: 'oauth' }) =>
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
            auth,
          },
          status: { state: 'Connected' },
        } as never,
        'gazelle',
      );

    beforeEach(() => {
      mockMcpServers = [registered()];
    });

    it('opens the same wizard pre-filled, titled as an edit of the connector', async () => {
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      expect(
        await screen.findByRole('heading', {
          level: 1,
          name: 'Edit connector',
        }),
      ).toBeInTheDocument();
      // The connector is named in the context line and the document title,
      // as on every edit frame.
      expect(
        screen.getByText('Customize / Connectors / jira'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(document.title).toBe('Edit jira · Connectors'),
      );
      expect(screen.getByLabelText(/^Server address/)).toHaveValue(
        'https://jira.example.com/mcp',
      );
      expect(screen.getByLabelText(/^What does it give access to/)).toHaveValue(
        'Search, read and update tickets',
      );
      // The name is the display name, which an edit can change; the
      // registered name under it cannot.
      const name = screen.getByRole('textbox', { name: /^Name/ });
      expect(name).toHaveValue('jira');
      await waitFor(() => expect(name).not.toHaveAttribute('readonly'));
      expect(name).toHaveAccessibleDescription(
        'Shown when giving an agent access.',
      );
      expect(screen.getByText(/^Registered as/)).toHaveTextContent(
        'Registered as jira — used in its tool names. It cannot be changed.',
      );
      // Leaving goes back to the connector's page, where Edit was pressed.
      expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute(
        'href',
        '/customize/connectors/gazelle/jira',
      );
    });

    it('keeps a pinned connector’s session sign-in on save, saying what it means', async () => {
      mockMcpServers = [
        registered({
          type: 'oauth',
          authorizationServer: { issuer: 'https://auth.example.com' },
        }),
      ];
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      await screen.findByLabelText(/^Server address/);
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      expect(
        await screen.findByRole('radio', {
          name: 'Again in every conversation (session)',
        }),
      ).toBeChecked();
      // The issuer the choice depends on is on screen, Advanced open.
      expect(
        screen.getByLabelText(/^Where people sign in \(issuer URL\)/),
      ).toHaveValue('https://auth.example.com');
      expect(
        screen.getByText(
          'Agents will ask you to sign in again in every conversation.',
        ),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: 'Save changes' }),
      );
      await screen.findByText('Test the connection');

      expect(
        (
          toolCalls('core_mcpserver_update')[0][1] as {
            auth: { authorizationServer: object };
          }
        ).auth.authorizationServer,
      ).toEqual({ issuer: 'https://auth.example.com' });
    });

    it('names the connector by its display name in the edit frame', async () => {
      const server = registered();
      server.jsonData.metadata.annotations = {
        'ui.giantswarm.io/display-name': 'Acme Jira',
      };
      mockMcpServers = [server];
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      expect(
        await screen.findByText('Customize / Connectors / Acme Jira'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(document.title).toBe('Edit Acme Jira · Connectors'),
      );
      expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue(
        'Acme Jira',
      );
    });

    it('renames the connector through its display name on save', async () => {
      const server = registered();
      server.jsonData.metadata.annotations = {
        'ui.giantswarm.io/display-name': 'Acme Jira',
      };
      mockMcpServers = [server];
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      const name = await screen.findByRole('textbox', { name: /^Name/ });
      await waitFor(() => expect(name).not.toHaveAttribute('readonly'));
      await userEvent.clear(name);
      await userEvent.type(name, 'Acme Tickets');
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save changes' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_update')[0][1]).toMatchObject({
        name: 'jira',
        displayName: 'Acme Tickets',
      });
    });

    it('sends the tags on save only when they changed', async () => {
      musterTakesTags();
      const server = registered();
      server.jsonData.metadata.annotations = {
        'ui.giantswarm.io/tags': 'ticketing,ops',
      };
      mockMcpServers = [server];
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      await screen.findByRole('textbox', { name: /^Tags/ });
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save changes' }),
      );
      await screen.findByText('Test the connection');
      expect(toolCalls('core_mcpserver_update')[0][1]).not.toHaveProperty(
        'tags',
      );
    });

    it('saves an edit on a muster without tags, whatever tags the connector carries', async () => {
      // More than MAX_TAGS, written outside the portal: a reader keeps them.
      const server = registered();
      server.jsonData.metadata.annotations = {
        'ui.giantswarm.io/tags': Array.from(
          { length: 51 },
          (_, index) => `tag-${index}`,
        ).join(','),
      };
      mockMcpServers = [server];
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      await screen.findByLabelText(/^Server address/);
      await waitFor(() => expect(describeTool).toHaveBeenCalled());
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save changes' }),
      );
      await screen.findByText('Test the connection');
      expect(toolCalls('core_mcpserver_update')[0][1]).not.toHaveProperty(
        'tags',
      );
    });

    it('replaces the tags on save when one is removed', async () => {
      musterTakesTags();
      const server = registered();
      server.jsonData.metadata.annotations = {
        'ui.giantswarm.io/tags': 'ticketing,ops',
      };
      mockMcpServers = [server];
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      await screen.findByRole('textbox', { name: /^Tags/ });
      const added = screen.getByRole('grid', { name: 'Tags' });
      const ops = within(added).getByRole('row', { name: /ops/ });
      await userEvent.click(within(ops).getByRole('button'));
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save changes' }),
      );
      await screen.findByText('Test the connection');
      expect(toolCalls('core_mcpserver_update')[0][1]).toMatchObject({
        tags: ['ticketing'],
      });
    });

    it('leaves the display name alone when the name is not changed', async () => {
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      await screen.findByLabelText(/^Server address/);
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await userEvent.click(
        await screen.findByRole('button', { name: 'Save changes' }),
      );
      await screen.findByText('Test the connection');

      expect(toolCalls('core_mcpserver_update')[0][1]).not.toHaveProperty(
        'displayName',
      );
    });

    it('keeps the name read-only on a muster that takes no display name', async () => {
      musterTakesDisplayName(false);
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      const name = await screen.findByRole('textbox', { name: /^Name/ });
      await waitFor(() =>
        expect(describeTool).toHaveBeenCalledWith(
          'core_mcpserver_update',
          'gazelle',
        ),
      );
      expect(name).toHaveAttribute('readonly');
      expect(name).toHaveAccessibleDescription(
        'It cannot be changed after registration.',
      );
      // A plain id needs no second line saying the same name.
      expect(screen.queryByText(/Registered as/)).not.toBeInTheDocument();
    });

    it('says once that the name is fixed, on a muster that takes no display name', async () => {
      musterTakesDisplayName(false);
      const server = registered();
      server.jsonData.metadata.annotations = {
        'ui.giantswarm.io/display-name': 'Acme Jira',
      };
      mockMcpServers = [server];
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      const name = await screen.findByRole('textbox', { name: /^Name/ });
      expect(name).toHaveValue('Acme Jira');
      expect(name).toHaveAccessibleDescription(
        'It cannot be changed after registration.',
      );
      const registeredAs = screen.getByText(/^Registered as/);
      expect(registeredAs).toHaveTextContent(
        'Registered as jira — used in its tool names.',
      );
      expect(registeredAs).not.toHaveTextContent(/cannot be changed/);
    });

    it('keeps the name of a family member read-only, the family sharing it', async () => {
      const server = registered();
      (server.jsonData.spec as Record<string, unknown>).family = {
        name: 'tickets',
        instanceArg: 'site',
      };
      mockMcpServers = [server];
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      const name = await screen.findByRole('textbox', { name: /^Name/ });
      await waitFor(() =>
        expect(describeTool).toHaveBeenCalledWith(
          'core_mcpserver_update',
          'gazelle',
        ),
      );
      expect(name).toHaveAttribute('readonly');
      expect(name).toHaveAccessibleDescription(
        'Shared with the other members of the tickets family, so it is set where they are defined.',
      );
    });

    it('marks the invalid fields themselves on Continue, as when adding', async () => {
      await renderWizard('/customize/connectors/gazelle/jira/edit');

      const address = await screen.findByLabelText(/^Server address/);
      await userEvent.clear(address);
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));

      expect(address).toHaveAttribute('aria-invalid', 'true');
      expect(address).toHaveAccessibleDescription(
        expect.stringContaining('Enter the server address'),
      );
      expect(address).toHaveFocus();
      expect(
        screen.queryByText('How do people sign in?'),
      ).not.toBeInTheDocument();
    });

    describe('with a client muster stored', () => {
      const STORED_REF = { name: 'jira-muster-client-x7k2p9m4qa' };
      const withClient = (ref: { name: string }) =>
        new MCPServer(
          {
            apiVersion: 'muster.giantswarm.io/v1alpha1',
            kind: 'MCPServer',
            metadata: { name: 'jira', namespace: 'muster' },
            spec: {
              type: 'streamable-http',
              url: 'https://jira.example.com/mcp',
              autoStart: true,
              auth: {
                type: 'oauth',
                authorizationServer: {
                  issuer: 'https://app.hubspot.com',
                  clientCredentialsSecretRef: ref,
                },
              },
            },
            status: { state: 'Connected' },
          } as never,
          'gazelle',
        );

      async function openSignIn() {
        await renderWizard('/customize/connectors/gazelle/jira/edit');
        await screen.findByLabelText(/^Server address/);
        await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
        await screen.findByText('How do people sign in?');
        return screen.getByRole('group', { name: 'Client credentials' });
      }

      it('shows it as stored, never its values, and keeps it on an ordinary save', async () => {
        mockMcpServers = [withClient(STORED_REF)];
        const credentials = await openSignIn();

        expect(
          within(credentials).getByText('Client secret stored'),
        ).toBeInTheDocument();
        expect(
          within(credentials).getByText(
            'Muster keeps the client in a Kubernetes Secret of type Opaque, which belongs to the connector and is deleted with it.',
          ),
        ).toBeInTheDocument();
        expect(
          within(credentials).queryByLabelText(/^Client secret/),
        ).not.toBeInTheDocument();
        expect(
          within(credentials).queryByLabelText(/^Client ID/),
        ).not.toBeInTheDocument();
        expect(
          within(credentials).getByRole('radio', { name: 'Existing Secret' }),
        ).not.toBeChecked();

        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        await screen.findByText('Test the connection');
        const [update] = toolCalls('core_mcpserver_update');
        expect(update[1]).toMatchObject({
          auth: {
            authorizationServer: { clientCredentialsSecretRef: STORED_REF },
          },
        });
        expect(update[1]).not.toHaveProperty('clientCredentials');
      });

      it('replaces it with a new client, sent without the old reference', async () => {
        mockMcpServers = [withClient(STORED_REF)];
        const credentials = await openSignIn();

        await userEvent.click(
          within(credentials).getByRole('button', { name: 'Replace' }),
        );
        const id = within(credentials).getByLabelText(/^Client ID/);
        const secret = within(credentials).getByLabelText(/^Client secret/);
        expect(id).toHaveValue('');
        expect(secret).toHaveValue('');
        await userEvent.type(id, 'new-client');
        await userEvent.type(secret, 'new-s3cret');
        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        await screen.findByText('Test the connection');

        const [validate] = toolCalls('core_mcpserver_validate');
        expect(JSON.stringify(validate)).not.toContain('new-s3cret');
        const [update] = toolCalls('core_mcpserver_update');
        expect(update[1]).toMatchObject({
          name: 'jira',
          auth: { authorizationServer: { issuer: 'https://app.hubspot.com' } },
          clientCredentials: {
            clientId: 'new-client',
            clientSecret: 'new-s3cret',
          },
        });
        expect(
          (update[1] as { auth: { authorizationServer: object } }).auth
            .authorizationServer,
        ).not.toHaveProperty('clientCredentialsSecretRef');
      });

      it('saves later edits without the replaced reference', async () => {
        mockMcpServers = [withClient(STORED_REF)];
        const credentials = await openSignIn();
        await userEvent.click(
          within(credentials).getByRole('button', { name: 'Replace' }),
        );
        await userEvent.type(
          within(credentials).getByLabelText(/^Client ID/),
          'new-client',
        );
        await userEvent.type(
          within(credentials).getByLabelText(/^Client secret/),
          'new-s3cret',
        );
        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        await screen.findByText('Test the connection');

        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
        await screen.findByText('How do people sign in?');
        expect(screen.getByText('Client secret stored')).toBeInTheDocument();
        await userEvent.type(
          screen.getByLabelText(/^Permissions to ask for \(scopes\)/),
          'read',
        );
        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        await screen.findByText('Test the connection');

        const updates = toolCalls('core_mcpserver_update');
        expect(updates).toHaveLength(2);
        expect(updates[1][1]).not.toHaveProperty('clientCredentials');
        expect(
          (updates[1][1] as { auth: { authorizationServer: object } }).auth
            .authorizationServer,
        ).toEqual({ issuer: 'https://app.hubspot.com', scopes: 'read' });
      });

      it('asks for the client again when the sign-in server changes', async () => {
        mockMcpServers = [withClient(STORED_REF)];
        await openSignIn();
        // The disclosure remounts on a blocked save: read the group afresh.
        const credentials = () =>
          screen.getByRole('group', { name: 'Client credentials' });

        const issuer = screen.getByLabelText(
          /^Where people sign in \(issuer URL\)/,
        );
        await userEvent.clear(issuer);
        await userEvent.type(issuer, 'https://api.hubspot.com');

        expect(
          within(credentials()).getByText(
            'The sign-in server changed, so enter the client again.',
          ),
        ).toBeInTheDocument();
        expect(
          within(credentials()).queryByText('Client secret stored'),
        ).not.toBeInTheDocument();
        expect(
          within(credentials()).queryByRole('button', {
            name: 'Keep stored secret',
          }),
        ).not.toBeInTheDocument();
        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        expect(
          await screen.findByText('Enter the client ID.'),
        ).toBeInTheDocument();
        expect(
          screen.getByText('Enter the client secret.'),
        ).toBeInTheDocument();
        expect(toolCalls('core_mcpserver_update')).toEqual([]);

        await userEvent.type(
          within(credentials()).getByLabelText(/^Client ID/),
          'new-client',
        );
        await userEvent.type(
          within(credentials()).getByLabelText(/^Client secret/),
          'new-s3cret',
        );
        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        await screen.findByText('Test the connection');
        const [update] = toolCalls('core_mcpserver_update');
        expect(update[1]).toMatchObject({
          auth: { authorizationServer: { issuer: 'https://api.hubspot.com' } },
          clientCredentials: {
            clientId: 'new-client',
            clientSecret: 'new-s3cret',
          },
        });
        expect(
          (update[1] as { auth: { authorizationServer: object } }).auth
            .authorizationServer,
        ).not.toHaveProperty('clientCredentialsSecretRef');
      });

      it('says the stored client goes unused without an issuer', async () => {
        mockMcpServers = [withClient(STORED_REF)];
        const credentials = await openSignIn();

        await userEvent.clear(
          screen.getByLabelText(/^Where people sign in \(issuer URL\)/),
        );

        expect(
          within(credentials).getByText(
            'Without an issuer, the stored client is no longer used.',
          ),
        ).toBeInTheDocument();
        expect(
          within(credentials).queryByText('Client secret stored'),
        ).not.toBeInTheDocument();
        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        await screen.findByText('Test the connection');
        const [update] = toolCalls('core_mcpserver_update');
        expect(update[1]).toMatchObject({ auth: { type: 'oauth' } });
        expect((update[1] as { auth: object }).auth).not.toHaveProperty(
          'authorizationServer',
        );
      });

      it('wants both values once Replace is chosen, and moves the focus', async () => {
        mockMcpServers = [withClient(STORED_REF)];
        await openSignIn();
        // The disclosure remounts on a blocked save: read the group afresh.
        const credentials = () =>
          screen.getByRole('group', { name: 'Client credentials' });

        await userEvent.click(
          within(credentials()).getByRole('button', { name: 'Replace' }),
        );
        const id = within(credentials()).getByLabelText(/^Client ID/);
        await waitFor(() => expect(id).toHaveFocus());
        expect(
          within(credentials()).getByLabelText(/^Client secret/),
        ).toHaveAttribute('autocomplete', 'new-password');

        await userEvent.click(
          screen.getByRole('button', { name: 'Save changes' }),
        );
        expect(
          await screen.findByText('Enter the client ID.'),
        ).toBeInTheDocument();
        expect(
          screen.getByText('Enter the client secret.'),
        ).toBeInTheDocument();
        expect(toolCalls('core_mcpserver_update')).toEqual([]);

        await userEvent.click(
          within(credentials()).getByRole('button', {
            name: 'Keep stored secret',
          }),
        );
        await waitFor(() =>
          expect(
            within(credentials()).getByRole('button', { name: 'Replace' }),
          ).toHaveFocus(),
        );
      });

      it('keeps the stored client when Replace is taken back', async () => {
        mockMcpServers = [withClient(STORED_REF)];
        const credentials = await openSignIn();

        await userEvent.click(
          within(credentials).getByRole('button', { name: 'Replace' }),
        );
        await userEvent.type(
          within(credentials).getByLabelText(/^Client ID/),
          'typo',
        );
        await userEvent.click(
          within(credentials).getByRole('button', {
            name: 'Keep stored secret',
          }),
        );
        expect(
          within(credentials).getByText('Client secret stored'),
        ).toBeInTheDocument();
      });

      it('shows a Secret someone else named as an existing Secret', async () => {
        mockMcpServers = [withClient({ name: 'hubspot-oauth-client' })];
        const credentials = await openSignIn();

        expect(
          within(credentials).getByRole('radio', { name: 'Existing Secret' }),
        ).toBeChecked();
        expect(
          within(credentials).getByLabelText(/^Secret name(?!space)/),
        ).toHaveValue('hubspot-oauth-client');
        expect(
          within(credentials).queryByText('Client secret stored'),
        ).not.toBeInTheDocument();
      });
    });

    it('saves the changes as an update of the connector, never a second one', async () => {
      await renderWizard('/customize/connectors/gazelle/jira/edit');

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
        '/customize/connectors/gazelle/jira',
      );
    });
  });

  it('closes a new registration to the connectors list', async () => {
    await renderWizard('/customize/connectors/new');

    expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute(
      'href',
      '/customize/connectors',
    );
  });
});
