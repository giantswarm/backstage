import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- agent-manager is reached through muster.
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import {
  ExternalUrlConsentManager,
  externalUrlConsentApiRef,
} from '@giantswarm/backstage-plugin-ui-react';

import type { HarnessChoice } from '../../lib/harnesses';
import type { OrganizationConnector } from '../../lib/organizations';
import { organizationsRouteRef } from '../../routes';
import {
  NewAgentFormProvider,
  useNewAgentForm,
  type NewAgentFormState,
} from '../NewAgentFormProvider';
import { OrganizationConnectors } from './OrganizationConnectors';

// The organizations agent-manager names for the person: `org-otter` and
// `org-acme` among them.
jest.mock('../OrganizationDirectoryProvider', () => ({
  ...jest.requireActual('../OrganizationDirectoryProvider'),
  useOrganizationDirectory: () =>
    jest.requireActual('../../lib/__fixtures__/organizations')
      .TEST_ORGANIZATION_DIRECTORY,
}));

const CLAUDE: HarnessChoice = { name: 'claude-code', runtime: 'claude' };
jest.mock('../../hooks/useHarnessChoices', () => ({
  useHarnessChoices: () => ({
    choices: [{ name: 'kagent', runtime: 'kagent' }, CLAUDE],
    platformHarness: 'kagent',
    platformChoice: { name: 'kagent', runtime: 'kagent' },
    errors: [],
    isLoading: false,
  }),
}));
/** `get_info`'s version; none, as from a `get_info` that failed, by default. */
let mockAgentManagerVersion: string | undefined;
jest.mock('../../hooks/useAgentManager', () => ({
  ...jest.requireActual('../../hooks/useAgentManager'),
  useAgentManagerInfo: () => ({
    info: mockAgentManagerVersion
      ? { version: mockAgentManagerVersion }
      : undefined,
    isLoading: false,
    error: null,
  }),
}));

const READY: OrganizationConnector = {
  name: 'jira',
  url: 'https://jira.example.com/mcp',
  credentials: [
    {
      header: 'Authorization',
      secret: 'tenant-credential-jira',
      key: 'token',
      state: 'present',
    },
  ],
  accepted: true,
  managedBy: 'agent-manager',
};
const NO_CREDENTIAL: OrganizationConnector = {
  name: 'deepwiki',
  url: 'https://mcp.deepwiki.com/mcp',
  credentials: [
    {
      header: 'Authorization',
      secret: 'tenant-credential-deepwiki',
      key: 'token',
      state: 'missing',
    },
  ],
  accepted: false,
  reason: 'DiscoveryFailed',
  message: 'secret tenant-credential-deepwiki not found',
  managedBy: 'agent-manager',
};
/** What an editor reads: the dry run of the Secret is refused for them. */
const UNCHECKED: OrganizationConnector = {
  name: 'wiki',
  url: 'https://wiki.example.com/mcp',
  credentials: [
    { header: 'Authorization', secret: 'wiki', key: 'token', state: 'unknown' },
  ],
  accepted: null,
  managedBy: 'agent-manager',
};
/** The muster binding the agent chart renders for an agent of the namespace. */
const MUSTER_BINDING: OrganizationConnector = {
  name: 'reviewer',
  url: 'https://muster.example.com/mcp',
  credentials: [],
  accepted: true,
  managedBy: 'Helm',
};
/** A connector of the organization that another chart's release renders. */
const OTHER_CHART: OrganizationConnector = {
  ...READY,
  name: 'status-page',
  url: 'https://status.example.com/mcp',
  managedBy: 'Helm',
};
const ACME_ONLY: OrganizationConnector = {
  ...READY,
  name: 'acme-tracker',
};

/** A copy of what the platform curates: the Connectors tab offers no Replace. */
const CURATED_NO_CREDENTIAL: OrganizationConnector = {
  ...NO_CREDENTIAL,
  name: 'platform-wiki',
  curated: true,
};

const OTTER_CONNECTORS = [READY, NO_CREDENTIAL, UNCHECKED, MUSTER_BINDING];
const CONNECTORS: Record<string, OrganizationConnector[]> = {
  'org-otter': OTTER_CONNECTORS,
  'org-acme': [ACME_ONLY, CURATED_NO_CREDENTIAL],
};

/** agent-manager through muster, `create_agent` taking `connectors` or not. */
function musterApi(takesConnectors = true) {
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      if (name === 'x_agent-manager_list_organization_connectors') {
        return { connectors: CONNECTORS[args.namespace as string] ?? [] };
      }
      throw new Error(`unexpected tool ${name}`);
    },
  );
  const describeTool = jest.fn(async (name: string) => ({
    name,
    inputSchema: {
      type: 'object',
      properties: {
        toolset: {},
        ...(takesConnectors ? { connectors: {} } : {}),
      },
    },
  }));
  return { api: { callTool, describeTool } as unknown as MusterApi, callTool };
}

const STATE: NewAgentFormState = {
  name: 'Reviewer',
  slug: 'reviewer',
  description: '',
  tags: [],
  installation: 'gazelle',
  tenant: 'org-otter',
  tenantChoices: ['org-otter', 'org-acme', 'kagent'],
  modelConfigName: 'sonnet',
  modelConfigNamespace: 'org-otter',
  modelDisplayName: undefined,
  harness: undefined,
  droppedHarness: undefined,
  systemMessage: '',
  egressText: '',
  egressPolicyRefs: [],
  connectors: [],
  defaultWorkspace: '',
  selectedSkills: [],
  keptSkills: [],
  selectedPlugins: [],
  keptPlugins: [],
  toolset: [],
};

/** What the wizard would send, and the earlier steps' changes. */
function Probe() {
  const { state, selectTenant, selectHarness, setToolsChatOnly } =
    useNewAgentForm();
  return (
    <>
      <output data-testid="connectors">{state.connectors.join(',')}</output>
      <button type="button" onClick={() => selectTenant('org-acme')}>
        Owner acme
      </button>
      <button type="button" onClick={() => selectTenant('kagent')}>
        Owner platform
      </button>
      <button type="button" onClick={() => selectHarness(CLAUDE)}>
        Use Claude Code
      </button>
      <button type="button" onClick={() => setToolsChatOnly()}>
        Nothing outside the chat
      </button>
    </>
  );
}

async function renderSection(
  state: Partial<NewAgentFormState> = {},
  takesConnectors = true,
) {
  const { api, callTool } = musterApi(takesConnectors);
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [externalUrlConsentApiRef, new ExternalUrlConsentManager(jest.fn())],
      ]}
    >
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <NewAgentFormProvider initialState={{ ...STATE, ...state }}>
          <OrganizationConnectors />
          <Probe />
        </NewAgentFormProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/organizations': organizationsRouteRef } },
  );
  return { callTool };
}

const SECTION = 'Connectors from the organization page';
const section = () => screen.getByRole('region', { name: SECTION });
const picked = () => screen.getByTestId('connectors').textContent;

describe('OrganizationConnectors', () => {
  afterEach(() => {
    mockAgentManagerVersion = undefined;
    CONNECTORS['org-otter'] = OTTER_CONNECTORS;
  });

  it.each([
    {
      agentManager: '3.3.4, which marks the muster bindings',
      version: '3.3.4',
      binding: { ...MUSTER_BINDING, musterBindingOf: 'reviewer' },
      offered: ['jira', 'status-page'],
    },
    {
      agentManager: 'older, which does not mark them',
      version: '3.3.3',
      binding: MUSTER_BINDING,
      offered: ['jira'],
    },
  ])(
    "offers a connector another chart renders, never an agent's muster binding, with agent-manager $agentManager",
    async ({ version, binding, offered }) => {
      mockAgentManagerVersion = version;
      CONNECTORS['org-otter'] = [READY, binding, OTHER_CHART];
      await renderSection();

      await screen.findByRole('checkbox', { name: 'jira' });
      for (const name of ['jira', 'status-page', 'reviewer']) {
        expect(screen.queryByRole('checkbox', { name }) !== null).toBe(
          offered.includes(name),
        );
      }
    },
  );

  it("offers the chosen organization's own connectors, not another organization's, and sends the picked ones by name", async () => {
    const user = userEvent.setup();
    const { callTool } = await renderSection();

    await user.click(await screen.findByRole('checkbox', { name: 'jira' }));
    expect(picked()).toBe('jira');
    expect(
      within(section()).getByText(/the same for everybody who uses the agent/),
    ).toBeInTheDocument();
    // Read as the person, for the chosen organization's namespace only.
    expect(callTool).toHaveBeenCalledWith(
      'x_agent-manager_list_organization_connectors',
      { namespace: 'org-otter' },
      'gazelle',
    );
    expect(screen.queryByRole('checkbox', { name: 'acme-tracker' })).toBeNull();
    // An agent's muster binding is no connector of the organization.
    expect(screen.queryByRole('checkbox', { name: 'reviewer' })).toBeNull();

    // Another organization: its connectors instead, the picked ones dropped.
    await user.click(screen.getByRole('button', { name: 'Owner acme' }));
    expect(
      await screen.findByRole('checkbox', { name: 'acme-tracker' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'jira' })).toBeNull();
    expect(picked()).toBe('');
  });

  it("keeps an edited agent's connector that Helm renders as picked, not as gone", async () => {
    await renderSection({ connectors: ['reviewer'] });

    expect(
      await screen.findByRole('checkbox', { name: 'reviewer' }),
    ).toBeChecked();
    expect(screen.queryByText(/Not in the organization any more/)).toBeNull();
  });

  it("says each connector's state in words, sends a missing credential to the Connectors tab's Replace credential, and still lets it be picked", async () => {
    const user = userEvent.setup();
    await renderSection();
    const deepwiki = await screen.findByRole('checkbox', { name: 'deepwiki' });

    expect(deepwiki).toHaveAccessibleDescription(
      expect.stringContaining(
        'An admin of the organization sets it with Replace credential',
      ),
    );
    expect(deepwiki).toHaveAccessibleDescription(
      expect.stringContaining(
        'Not accepted: the agent cannot use this connector until it is fixed. DiscoveryFailed: secret tenant-credential-deepwiki not found.',
      ),
    );
    expect(
      within(section()).getByRole('link', {
        name: /Open the Connectors tab/,
      }),
    ).toHaveAttribute(
      'href',
      '/organizations/gazelle/org-parent/otter/connectors',
    );
    expect(
      screen.getByRole('checkbox', { name: 'jira' }),
    ).toHaveAccessibleDescription('Ready to use.');
    // A credential the person may not check warns of nothing.
    expect(
      screen.getByRole('checkbox', { name: 'wiki' }),
    ).not.toHaveAccessibleDescription(/missing|accepted|Ready/);

    await user.click(deepwiki);
    expect(picked()).toBe('deepwiki');
  });

  it('sends a missing credential of a curated connector nowhere: the Connectors tab cannot set it', async () => {
    await renderSection({ tenant: 'org-acme' });
    const curated = await screen.findByRole('checkbox', {
      name: 'platform-wiki',
    });

    expect(curated).toHaveAccessibleDescription(
      expect.stringContaining(
        'The platform curates this connector, so its credential is not set on the organization page.',
      ),
    );
    expect(curated).not.toHaveAccessibleDescription(/Replace credential/);
    expect(
      within(section()).queryByRole('link', { name: /Connectors tab/ }),
    ).toBeNull();
  });

  it('says who adds a connector to an organization with none, and only links to its connectors', async () => {
    await renderSection({ tenant: 'org-alpha' });

    expect(
      await within(section()).findByText(
        /An admin of the organization adds one by asking an agent/,
      ),
    ).toBeInTheDocument();
    expect(
      within(section()).getByRole('link', {
        name: /See the organization's connectors/,
      }),
    ).toHaveAttribute(
      'href',
      '/organizations/gazelle/org-parent/alpha/connectors',
    );
    expect(within(section()).queryByText(/Add one/)).toBeNull();
  });

  it.each([
    [
      'an agent-manager that does not take connectors',
      {},
      false,
      'The agent-manager of gazelle cannot give an agent these connectors yet.',
    ],
    [
      'a coding Harness',
      { harness: CLAUDE },
      true,
      'An agent on Claude Code cannot use these connectors: only an agent on the Declarative (Go ADK) runtime can, which is chosen on the first step.',
    ],
  ])(
    'says why it offers nothing for %s',
    async (_case, state, takesConnectors, reason) => {
      await renderSection(state, takesConnectors);

      expect(await within(section()).findByText(reason)).toBeInTheDocument();
      expect(within(section()).queryByRole('checkbox')).toBeNull();
    },
  );

  it('is not shown for an agent of the platform, and a move to a coding Harness drops the picked ones', async () => {
    const user = userEvent.setup();
    await renderSection({ connectors: ['jira'] });
    await screen.findByRole('checkbox', { name: 'jira' });

    await user.click(screen.getByRole('button', { name: 'Use Claude Code' }));
    expect(picked()).toBe('');

    await user.click(screen.getByRole('button', { name: 'Owner platform' }));
    expect(screen.queryByRole('region', { name: SECTION })).toBeNull();
  });

  it('holds them off under Nothing outside the chat, which drops the picked ones', async () => {
    const user = userEvent.setup();
    await renderSection({ connectors: ['jira'] });
    await screen.findByRole('checkbox', { name: 'jira' });

    await user.click(
      screen.getByRole('button', { name: 'Nothing outside the chat' }),
    );
    expect(picked()).toBe('');
    expect(screen.getByRole('checkbox', { name: 'jira' })).toBeDisabled();
    // The section says which option leads to these connectors alone.
    expect(
      within(section()).getByText(
        /turns these connectors off too\. To give the agent only these connectors, pick Only the tools I choose below/,
      ),
    ).toBeInTheDocument();
  });

  it("shows agent-manager's refusal of the selection in its words, until the selection changes", async () => {
    const user = userEvent.setup();
    const refused =
      'connectors: RemoteMCPServer "reviewer" is rendered by HelmRelease reviewer: it is an agent\'s muster binding, no connector (list_organization_connectors)';
    await renderSection({
      connectors: ['jira'],
      connectorsRefusal: { connectors: ['jira'], messages: [refused] },
    });

    expect(within(section()).getByText(refused)).toBeInTheDocument();
    await user.click(await screen.findByRole('checkbox', { name: 'jira' }));
    expect(within(section()).queryByText(refused)).toBeNull();
  });
});
