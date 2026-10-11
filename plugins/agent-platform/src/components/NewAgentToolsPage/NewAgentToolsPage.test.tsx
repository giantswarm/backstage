import { ReactNode, useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { UserEvent } from '@testing-library/user-event';
import {
  MCPServer,
  musterApiRef,
  TOOL_GROUP_LABEL,
  type FilterToolsOptions,
  type FilterToolsResponse,
  type MusterApi,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';
import {
  Agent,
  RemoteMCPServer,
} from '@giantswarm/backstage-plugin-kubernetes-react';

import {
  mockDesktopLayout,
  type MockedLayout,
  PageHeaderActionsProvider,
} from '@giantswarm/backstage-plugin-ui-react';

import { agentsRouteRef } from '../../routes';
import {
  NewAgentFormProvider,
  type NewAgentFormState,
  useNewAgentForm,
} from '../NewAgentFormProvider';
import { NewAgentToolsPage } from './NewAgentToolsPage';

// No skill repositories: the Tools step is step 2 of 3 and "Back" is step 1.
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({
    skills: [],
    isLoading: false,
    error: null,
    hasRepositories: false,
    failedRepositories: [],
    truncated: false,
  }),
}));

// The CR reads (MCPServer for the grouping and sign-in state, Agent for
// copy-from-agent) are stubbed per resource class; the real MCPServer/Agent
// classes build the fixtures so the label and header accessors are exercised.
const mockUseResources = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

function mcpServer(
  name: string,
  spec: Record<string, unknown>,
  labels: Record<string, string> = {},
  state = 'Connected',
) {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: { name, namespace: 'agent-platform', labels },
      spec: { type: 'streamable-http', ...spec },
      status: { state },
    } as never,
    'gazelle',
  );
}

const SERVER_CRS = [
  mcpServer(
    'kubernetes-gazelle',
    { family: { name: 'kubernetes', instanceArg: 'management_cluster' } },
    { [TOOL_GROUP_LABEL]: 'infrastructure' },
  ),
  mcpServer('agent-manager', {}, { [TOOL_GROUP_LABEL]: 'agent-platform' }),
  mcpServer('pro', { auth: { type: 'oauth' } }, {}, 'Auth Required'),
];

// The toolset lives on the agent's carrier RemoteMCPServer (named after the
// agent), which the copy-from-agent read lists alongside the templates.
let CARRIERS: RemoteMCPServer[] = [];

function agentWithToolset(name: string, toolset: string) {
  CARRIERS.push(
    new RemoteMCPServer(
      {
        apiVersion: 'api.kagent.dev/v1alpha3',
        kind: 'RemoteMCPServer',
        metadata: { name, namespace: 'kagent' },
        spec: {
          description: 'gateway',
          url: 'http://muster.agent-platform.svc.cluster.local:8090/mcp',
          headersFrom: [{ name: 'X-Muster-Toolset', value: toolset }],
        },
      } as never,
      'gazelle',
    ),
  );
  return new Agent(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Agent',
      metadata: {
        name,
        namespace: 'kagent',
        annotations: { 'ui.giantswarm.io/display-name': 'Existing agent' },
      },
      spec: {
        harnessRef: { name: 'kagent' },
        template: {
          modelConfig: { name: 'opus' },
          tools: [{ mcp: { server: { kind: 'RemoteMCPServer', name } } }],
        },
      },
    } as never,
    'gazelle',
  );
}

const TOOLS: ToolSummary[] = [
  {
    name: 'x_kubernetes_get_pods',
    summary: 'List pods',
    server: 'kubernetes',
    kind: 'tool',
    annotations: { readOnlyHint: true },
  },
  {
    name: 'x_kubernetes_delete_pod',
    summary: 'Delete a pod',
    server: 'kubernetes',
    kind: 'tool',
    annotations: { destructiveHint: true },
  },
  {
    name: 'x_agent-manager_create_agent',
    summary: 'Create an agent',
    server: 'agent-manager',
    kind: 'tool',
  },
  { name: 'core_service_list', summary: 'List services', kind: 'core' },
  {
    name: 'workflow_incident-triage',
    summary: 'Triage an incident',
    kind: 'workflow',
    annotations: { readOnlyHint: true },
  },
];
const PRO_TOOL: ToolSummary = {
  name: 'x_pro_list_boards',
  summary: 'List boards',
  server: 'pro',
  kind: 'tool',
  annotations: { readOnlyHint: true },
};

/** A registered server (no CR) with more tools than one page shows. */
const GITHUB_TOOLS: ToolSummary[] = Array.from({ length: 25 }, (_, i) => ({
  name: `x_github_tool_${String(i).padStart(2, '0')}`,
  summary: `GitHub tool ${i}`,
  server: 'github',
  kind: 'tool' as const,
}));

/** Enough workflows to be grouped, named the way a runbook catalogue names them. */
const MANY_WORKFLOWS: ToolSummary[] = [
  'mc-etcd-space-low',
  'mc-node-not-ready',
  'mc-api-down',
  'wc-pod-pending',
  'wc-node-taint',
  'cert-manager-down',
  'cert-manager-too-many-requests',
  'kube-api-latency',
  'kube-controller-down',
  'kube-scheduler-down',
  'flux-helm-release-failed',
  'flux-kustomization-failed',
  'lonely-one',
].map(name => ({
  name: `workflow_${name}`,
  summary: `Triage ${name}`,
  kind: 'workflow' as const,
  annotations: { readOnlyHint: true },
}));

const PRESETS = [
  { name: 'read-only', description: 'Read-only, from muster', built_in: true },
  { name: 'none', built_in: true },
  { name: 'infrastructure', description: 'The infrastructure servers' },
  { name: 'full', built_in: true },
];

type Scenario = {
  /** Whether the caller's session is signed in to `pro`. */
  signedIn: boolean;
  /** Whether this muster evaluates toolsets (echoes `toolset`) at all. */
  evaluatesToolsets: boolean;
  /** More catalogue entries, for the long-list and grouping cases. */
  extraTools?: ToolSummary[];
  /** Replaces the default five catalogue entries. */
  baseTools?: ToolSummary[];
};

/**
 * A muster that resolves toolsets against the fixture the way the real one
 * would: presets by annotation, `server:` by the tool's server, `tool:` and
 * `workflow:` by name, within what the session can see. `pro`'s tool is
 * visible only after the sign-in.
 */
function makeMusterApi(scenario: Scenario) {
  const base = [
    ...(scenario.baseTools ?? TOOLS),
    ...(scenario.extraTools ?? []),
  ];
  const visible = () => (scenario.signedIn ? [...base, PRO_TOOL] : base);

  const resolve = (selectors: string[]): FilterToolsResponse => {
    const matched = new Set<ToolSummary>();
    const unmatched: string[] = [];
    for (const selector of selectors) {
      const [kind, name] = [
        selector.slice(0, selector.indexOf(':')),
        selector.slice(selector.indexOf(':') + 1),
      ];
      let hits: ToolSummary[] = [];
      if (kind === 'preset') {
        if (!PRESETS.some(preset => preset.name === name)) {
          throw new Error(
            `toolset [${selectors.join(
              ',',
            )}] names unknown preset "${name}"; known presets: read-only, none, infrastructure, full`,
          );
        }
        if (name === 'read-only') {
          hits = visible().filter(tool => tool.annotations?.readOnlyHint);
        } else if (name === 'full') {
          hits = visible();
        } else if (name === 'infrastructure') {
          hits = visible().filter(tool => tool.server === 'kubernetes');
        }
        // `none` matches nothing, by definition — and is not "unmatched".
        for (const tool of hits) matched.add(tool);
        continue;
      }
      if (kind === 'server') {
        hits = visible().filter(tool => tool.server === name);
      } else if (kind === 'tool') {
        hits = visible().filter(tool => tool.name === name);
      } else if (kind === 'workflow') {
        hits = visible().filter(tool => tool.name === `workflow_${name}`);
      }
      if (hits.length === 0) {
        unmatched.push(selector);
      }
      for (const tool of hits) matched.add(tool);
    }
    const tools = [...matched];
    return {
      total: tools.length,
      filtered_count: tools.length,
      truncated: false,
      tools,
      toolset: selectors,
      toolset_unmatched: unmatched,
      presets: PRESETS,
    };
  };

  const filterTools = jest.fn(
    async (options: FilterToolsOptions = {}): Promise<FilterToolsResponse> => {
      if (!scenario.evaluatesToolsets) {
        // An older muster: ignores `toolset` and `include_presets`, answers
        // the unscoped catalogue, echoes nothing.
        const tools = visible().slice(0, options.limit ?? 5);
        return {
          total: visible().length,
          filtered_count: tools.length,
          truncated: tools.length < visible().length,
          tools,
        };
      }
      if (options.toolset) {
        return resolve(options.toolset);
      }
      return {
        total: visible().length,
        filtered_count: 0,
        truncated: true,
        tools: visible().slice(0, options.limit ?? 5),
        ...(options.includePresets ? { presets: PRESETS } : {}),
      };
    },
  );

  const listTools = jest.fn(async () => ({
    tools: visible(),
    servers_requiring_auth: scenario.signedIn
      ? []
      : [
          {
            name: 'pro',
            status: 'auth_required',
            auth_tool: 'core_auth_login',
          },
        ],
  }));

  const getAuthStatus = jest.fn(async () => ({
    servers: [
      {
        name: 'pro',
        status: scenario.signedIn ? 'connected' : 'auth_required',
        auth_tool: 'core_auth_login',
      },
    ],
  }));

  // muster's "already connected" answer: the hook then invalidates every
  // `['muster', …]` query, which is what makes the catalogue re-read.
  const signInServer = jest.fn(async () => {
    scenario.signedIn = true;
    return { status: 'connected' as const, message: 'Already connected.' };
  });

  const signOutServer = jest.fn();

  return {
    api: {
      filterTools,
      listTools,
      getAuthStatus,
      signInServer,
      signOutServer,
    } as unknown as MusterApi,
    filterTools,
    listTools,
    signInServer,
  };
}

/** What an edited agent's wizard opens with, the toolset set per test. */
const BASE_STATE: NewAgentFormState = {
  name: '',
  slug: '',
  description: '',
  installation: undefined,
  modelConfigName: undefined,
  modelConfigNamespace: undefined,
  modelDisplayName: undefined,
  harness: undefined,
  droppedHarness: undefined,
  systemMessage: '',
  egressText: '',
  selectedSkills: [],
  keptSkills: [],
  toolset: [],
};

/** Fills the step-1 fields the Tools step requires, then renders its child. */
function Seed({ children }: { children: ReactNode }) {
  const { setName, setInstallation, selectModelConfig, isComplete } =
    useNewAgentForm();
  useEffect(() => {
    setName('Reviewer');
    setInstallation('gazelle');
    selectModelConfig('opus', 'kagent');
    // One-shot seeding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return isComplete ? <>{children}</> : null;
}

/** Exposes the composed toolset for assertions on the step's output. */
function ToolsetProbe() {
  const { state } = useNewAgentForm();
  return <output data-testid="toolset">{state.toolset.join(' | ')}</output>;
}

async function renderStep(
  options: {
    api?: MusterApi;
    agents?: Agent[];
    /** The wizard's state when it opens, for the edit-mode round trip. */
    toolset?: string[];
    chatOnly?: boolean;
  } = {},
) {
  mockUseResources.mockImplementation(
    (_clusters: string[], ResourceClass: unknown) => {
      if (ResourceClass === MCPServer) {
        return { resources: SERVER_CRS, isLoading: false, errors: [] };
      }
      if (ResourceClass === Agent) {
        return {
          resources: options.agents ?? [],
          isLoading: false,
          errors: [],
        };
      }
      if (ResourceClass === RemoteMCPServer) {
        return { resources: CARRIERS, isLoading: false, errors: [] };
      }
      return { resources: [], isLoading: false, errors: [] };
    },
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={queryClient}>
      {/* The wizard frame's footer renders the actions the step registers, so
          the slot provider the page routes mount is mounted here too. */}
      <PageHeaderActionsProvider>
        <NewAgentFormProvider
          initialState={
            options.toolset
              ? {
                  ...BASE_STATE,
                  toolset: options.toolset,
                  toolsChatOnly: options.chatOnly ?? false,
                }
              : undefined
          }
        >
          <Seed>
            <NewAgentToolsPage />
            <ToolsetProbe />
          </Seed>
        </NewAgentFormProvider>
      </PageHeaderActionsProvider>
    </QueryClientProvider>
  );
  return renderInTestApp(
    options.api ? (
      <TestApiProvider apis={[[musterApiRef, options.api]]}>
        {tree}
      </TestApiProvider>
    ) : (
      tree
    ),
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );
}

const continueButton = () => screen.getByRole('button', { name: 'Continue' });
const toolsetOutput = () => screen.getByTestId('toolset').textContent;
/** The narrow-layout *Selected so far* bar (jsdom has no two-column viewport). */
const summaryBar = () =>
  screen.getByRole('region', { name: 'Selected so far' });
/** The access-level radio. */
const levels = () => screen.getByRole('radiogroup', { name: 'What it may do' });
const level = (name: string) => within(levels()).getByRole('radio', { name });
/** One connector of *Which apps?*. */
const connector = (name: string) =>
  screen.getByRole('group', { name: `Connector ${name}` });
const access = (name: string, option: 'Read-only' | 'All') =>
  within(connector(name)).getByRole('radio', { name: option });
const individualToggle = () =>
  screen.getByRole('button', {
    name: /^(Choose individual tools instead|Hide individual tools)$/,
  });
/**
 * The resolved list, inside the individual tools. Assertions on resolved tool
 * names are scoped to it: the same names sit in the catalogue's rows.
 */
const toolsetCard = () => screen.getByRole('region', { name: 'Toolset' });
/**
 * The catalogue inside the individual tools. Its groups carry the same names
 * as the resolved list's below it, so it is scoped by its own label.
 */
const catalogueCard = () => screen.getByLabelText('Tool catalogue');

/** Leaves *Nothing outside the chat*, the new agent's default, for no preset. */
async function ownPicks(user: UserEvent) {
  await user.click(
    await screen.findByRole('radio', { name: 'Only the tools I choose below' }),
  );
}
async function openIndividual(user: UserEvent) {
  await user.click(
    await screen.findByRole('button', {
      name: 'Choose individual tools instead',
    }),
  );
}
async function open(user: UserEvent, name: RegExp) {
  await user.click(
    await within(catalogueCard()).findByRole('button', { name }),
  );
}
/** Waits for the catalogue's connectors to be listed. */
async function connectorsListed() {
  await screen.findByRole('group', { name: 'Connector kubernetes' });
}

describe('NewAgentToolsPage', () => {
  let windowOpen: jest.SpyInstance;
  beforeEach(() => {
    mockUseResources.mockReset();
    CARRIERS = [];
    // jsdom has no window.open; null is the popup-blocked answer the sign-in
    // hook tolerates.
    windowOpen = jest.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    windowOpen.mockRestore();
  });

  describe('the access level', () => {
    it('starts a new agent at Nothing outside the chat, first of the options, with the selection below off', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });

      // Without skill repositories the step strip skips Skills.
      const strip = screen.getByRole('list', { name: 'Steps' });
      expect(
        within(strip)
          .getAllByRole('listitem')
          .map(item => item.textContent),
      ).toEqual(['Details', '2Tools', '3Review']);
      expect(
        screen.getByRole('heading', { name: 'What may it do?' }),
      ).toBeInTheDocument();

      await connectorsListed();
      await waitFor(() =>
        expect(
          within(levels())
            .getAllByRole('radio')
            .map(option => option.getAttribute('aria-label')),
        ).toEqual([
          'Nothing outside the chat',
          'Look things up',
          'Infrastructure',
          'Look things up and make changes',
          'Only the tools I choose below',
        ]),
      );
      expect(level('Nothing outside the chat')).toBeChecked();
      expect(within(levels()).getByText(/recommended/)).toBeInTheDocument();
      expect(within(levels()).getByText(/Full gateway/)).toBeInTheDocument();
      // muster's description of an environment preset.
      expect(
        within(levels()).getByText('The infrastructure servers'),
      ).toBeInTheDocument();

      expect(toolsetOutput()).toBe('');
      expect(continueButton()).toBeEnabled();
      expect(within(summaryBar()).getByText('No tools')).toBeInTheDocument();
      // Everything below is off until another option is picked.
      expect(access('kubernetes', 'All')).toBeDisabled();
      expect(individualToggle()).toBeDisabled();
      expect(
        screen.getByText('Pick another option above to add tools.'),
      ).toBeInTheDocument();
    });

    it('clears everything picked and turns the selection off; any other option turns it on again', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();

      await user.click(level('Look things up'));
      expect(toolsetOutput()).toBe('preset:read-only');
      expect(level('Look things up')).toBeChecked();
      expect(
        screen.getByText(
          'Look things up already reads every connector; All adds its changes.',
        ),
      ).toBeInTheDocument();
      await user.click(access('kubernetes', 'All'));
      expect(toolsetOutput()).toBe('preset:read-only | server:kubernetes');

      await user.click(level('Nothing outside the chat'));
      expect(toolsetOutput()).toBe('');
      expect(access('kubernetes', 'All')).toBeDisabled();
      expect(access('kubernetes', 'All')).not.toBeChecked();
      expect(individualToggle()).toBeDisabled();

      await user.click(level('Infrastructure'));
      expect(toolsetOutput()).toBe('preset:infrastructure');
      expect(access('kubernetes', 'All')).toBeEnabled();
      expect(individualToggle()).toBeEnabled();
    });

    it('keeps the picks below as the base changes; Full gateway stands alone', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();

      await ownPicks(user);
      expect(toolsetOutput()).toBe('');
      expect(continueButton()).toBeEnabled();
      await user.click(access('kubernetes', 'All'));
      await user.click(level('Look things up'));
      expect(toolsetOutput()).toBe('preset:read-only | server:kubernetes');
      await user.click(level('Infrastructure'));
      expect(toolsetOutput()).toBe('preset:infrastructure | server:kubernetes');
      await user.click(level('Only the tools I choose below'));
      expect(toolsetOutput()).toBe('server:kubernetes');

      await user.click(level('Look things up and make changes'));
      expect(toolsetOutput()).toBe('preset:full');
      expect(
        screen.getByText('Full gateway already includes every tool.'),
      ).toBeInTheDocument();
      expect(access('kubernetes', 'All')).toBeDisabled();
      expect(screen.getAllByText('Full gateway access').length).toBeGreaterThan(
        0,
      );
    });

    it('shows progress while the presets are read, offering the built-ins meanwhile', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });
      const gated: MusterApi = {
        ...api,
        filterTools: async (options = {}) => {
          if (options.includePresets) {
            await gate;
          }
          return api.filterTools(options);
        },
      };
      await renderStep({ api: gated });

      expect(
        await screen.findByRole('progressbar', {
          name: "Reading the environment's presets…",
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Only the built-in presets are known'),
      ).not.toBeInTheDocument();
      expect(level('Look things up')).toBeInTheDocument();

      release();

      expect(
        await screen.findByRole('radio', { name: 'Infrastructure' }),
      ).toBeInTheDocument();
    });

    it('degrades honestly against a muster that does not evaluate toolsets yet', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: false,
      });
      await renderStep({ api });
      const user = userEvent.setup();

      expect(
        await screen.findByText('Only the built-in presets are known'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('radio', { name: 'Infrastructure' }),
      ).not.toBeInTheDocument();

      await user.click(level('Look things up'));

      expect(
        await within(summaryBar()).findByText(
          "This environment's muster does not evaluate toolsets yet",
        ),
      ).toBeInTheDocument();
      expect(toolsetOutput()).toBe('preset:read-only');
      expect(continueButton()).toBeEnabled();
    });

    it('degrades to the built-in presets and selectors by name where the muster plugin is not installed', async () => {
      await renderStep();
      const user = userEvent.setup();

      expect(
        within(levels())
          .getAllByRole('radio')
          .map(option => option.getAttribute('aria-label')),
      ).toEqual([
        'Nothing outside the chat',
        'Look things up',
        'Look things up and make changes',
        'Only the tools I choose below',
      ]);
      expect(
        screen.getByText("Connectors can't be listed in this portal."),
      ).toBeInTheDocument();

      await ownPicks(user);
      await openIndividual(user);
      await user.type(screen.getByLabelText('Selector'), 'server:pro');
      await user.click(screen.getByRole('button', { name: 'Add selector' }));
      expect(toolsetOutput()).toBe('server:pro');
      expect(continueButton()).toBeEnabled();
    });
  });

  describe('which apps', () => {
    it('picks a connector’s read-only tools one by one, or all of it, and takes back exactly that', async () => {
      const { api, filterTools } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);

      // Name and tool count only.
      expect(connector('kubernetes')).toHaveTextContent('kubernetes (family)');
      expect(connector('kubernetes')).toHaveTextContent('2 tools');

      await user.click(access('kubernetes', 'Read-only'));
      expect(toolsetOutput()).toBe('tool:x_kubernetes_get_pods');
      expect(access('kubernetes', 'Read-only')).toBeChecked();
      await waitFor(() =>
        expect(filterTools).toHaveBeenCalledWith(
          expect.objectContaining({ toolset: ['tool:x_kubernetes_get_pods'] }),
        ),
      );

      // All replaces it with the whole connector, which follows new tools.
      await user.click(access('kubernetes', 'All'));
      expect(toolsetOutput()).toBe('server:kubernetes');
      expect(access('kubernetes', 'All')).toBeChecked();
      expect(access('kubernetes', 'Read-only')).not.toBeChecked();
      expect(connector('kubernetes')).toHaveTextContent(
        '2 tools · also ones added later',
      );

      // Choosing it again takes it back.
      await user.click(access('kubernetes', 'All'));
      expect(toolsetOutput()).toBe('');
      expect(access('kubernetes', 'All')).not.toBeChecked();
    });

    it('offers no read-only choice it cannot enumerate', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);

      // agent-manager's one tool changes things.
      expect(access('agent-manager', 'Read-only')).toBeDisabled();
      // pro's tools are not listed before a sign-in; All still works.
      expect(connector('pro')).toHaveTextContent('Sign in to list its tools');
      expect(access('pro', 'Read-only')).toBeDisabled();
      await user.click(access('pro', 'All'));
      expect(toolsetOutput()).toBe('server:pro');
      expect(
        within(summaryBar()).getByText(
          /1 connector selected without a sign-in/,
        ),
      ).toBeInTheDocument();
    });

    it('shows tools picked one by one as a count, with neither choice checked', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      await openIndividual(user);

      await open(user, /^Infrastructure — /);
      await open(user, /^kubernetes \(family\) — 2 tools/);
      await user.click(
        screen.getByRole('checkbox', { name: 'Tool x_kubernetes_delete_pod' }),
      );

      expect(toolsetOutput()).toBe('tool:x_kubernetes_delete_pod');
      expect(connector('kubernetes')).toHaveTextContent(
        '1 of 2 tools selected',
      );
      expect(access('kubernetes', 'Read-only')).not.toBeChecked();
      expect(access('kubernetes', 'All')).not.toBeChecked();

      // Read-only then means exactly the read-only tools.
      await user.click(access('kubernetes', 'Read-only'));
      expect(toolsetOutput()).toBe('tool:x_kubernetes_get_pods');
    });

    it('lists three connectors plainly, without a search or paging', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      await connectorsListed();

      expect(
        screen.getAllByRole('group', { name: /^Connector / }),
      ).toHaveLength(3);
      expect(
        screen.queryByLabelText('Search connectors'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /more connectors/ }),
      ).not.toBeInTheDocument();
    });

    it('pages 300 connectors and finds one by name', async () => {
      const many: ToolSummary[] = Array.from({ length: 300 }, (_, i) => ({
        name: `x_app${String(i).padStart(3, '0')}_get`,
        summary: `App ${i}`,
        server: `app${String(i).padStart(3, '0')}`,
        kind: 'tool' as const,
        annotations: { readOnlyHint: true },
      }));
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: many,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);

      expect(
        screen.getAllByRole('group', { name: /^Connector / }),
      ).toHaveLength(12);
      expect(
        screen.getByRole('button', { name: 'Show 12 more connectors' }),
      ).toBeInTheDocument();

      await user.type(screen.getByLabelText('Search connectors'), 'app250');
      expect(
        screen.getAllByRole('group', { name: /^Connector / }),
      ).toHaveLength(1);
      await user.click(access('app250', 'Read-only'));
      expect(toolsetOutput()).toBe('tool:x_app250_get');
    });
  });

  describe('the individual tools', () => {
    it('open from the link, straight to the catalogue, with the power-user paths inside', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);

      expect(
        screen.queryByRole('heading', { name: 'Individual tools' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Selector')).not.toBeInTheDocument();
      expect(
        screen.queryByText("Copy another agent's toolset"),
      ).not.toBeInTheDocument();

      await openIndividual(user);

      expect(individualToggle()).toHaveAttribute('aria-expanded', 'true');
      expect(
        within(catalogueCard()).getByRole('button', {
          name: 'Infrastructure — 1 connector · 2 tools',
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Copy another agent's toolset")).toBeVisible();
      expect(screen.getByLabelText('Selector')).toBeInTheDocument();

      await user.click(individualToggle());
      expect(
        screen.queryByRole('heading', { name: 'Individual tools' }),
      ).not.toBeInTheDocument();
    });

    it('filters a long catalogue with the What it does dropdown and a search', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: GITHUB_TOOLS,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      await openIndividual(user);

      expect(
        screen.getByText('4 connectors · 29 tools · 1 workflow'),
      ).toBeInTheDocument();
      const effect = screen.getByRole('button', {
        name: /Filter by what it does/,
      });
      await user.click(effect);
      expect(
        within(await screen.findByRole('listbox'))
          .getAllByRole('option')
          .map(option => option.textContent),
      ).toEqual(['Reads 2', 'Changes things 28']);
      await user.click(screen.getByRole('option', { name: 'Reads 2' }));
      await user.keyboard('{Escape}');
      expect(
        screen.getByText('1 tool and 1 workflow match'),
      ).toBeInTheDocument();
      expect(
        within(catalogueCard()).queryByRole('button', {
          name: /^Registered servers/,
        }),
      ).not.toBeInTheDocument();

      await user.type(screen.getByLabelText('Search tools'), 'github');
      expect(
        screen.getByText('Nothing matches "github" with this filter.'),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole('button', { name: 'Show everything again' }),
      );
      expect(
        screen.getByText('4 connectors · 29 tools · 1 workflow'),
      ).toBeInTheDocument();
      expect(toolsetOutput()).toBe('');
    });

    it('has no search or filter over a three-entry catalogue', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        baseTools: [TOOLS[0], TOOLS[2], TOOLS[4]],
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      await openIndividual(user);

      expect(
        within(catalogueCard()).getByRole('button', {
          name: 'Infrastructure — 1 connector · 1 tool',
        }),
      ).toBeInTheDocument();
      expect(screen.queryByLabelText('Search tools')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Filter by what it does/ }),
      ).not.toBeInTheDocument();
      await open(user, /^Infrastructure — /);
      await open(user, /^kubernetes \(family\) — 1 tool/);
      expect(
        within(catalogueCard()).queryByRole('button', {
          name: /^Show \d+ more/,
        }),
      ).not.toBeInTheDocument();
    });

    it('pages a 300-tool connector’s rows', async () => {
      const manyTools: ToolSummary[] = Array.from({ length: 300 }, (_, i) => ({
        name: `x_github_tool_${String(i).padStart(3, '0')}`,
        summary: `GitHub tool ${i}`,
        server: 'github',
        kind: 'tool' as const,
      }));
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: manyTools,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      expect(connector('github')).toHaveTextContent('300 tools');
      await openIndividual(user);
      await open(user, /^Registered servers — /);
      await open(user, /^github — 300 tools/);

      const catalogue = within(catalogueCard());
      expect(
        catalogue.getAllByRole('checkbox', { name: /^Tool x_github_/ }),
      ).toHaveLength(20);
      expect(
        catalogue.getByText('20 tools shown, 280 more'),
      ).toBeInTheDocument();
    });

    it('groups many workflows by their name prefix', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: MANY_WORKFLOWS,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      await openIndividual(user);
      await open(user, /^Workflows — 14 workflows/);
      await open(user, /^mc — 3 workflows/);

      expect(
        screen
          .getAllByRole('checkbox', { name: /^Workflow / })
          .map(row => row.getAttribute('aria-label')),
      ).toEqual([
        'Workflow mc-api-down',
        'Workflow mc-etcd-space-low',
        'Workflow mc-node-not-ready',
      ]);
    });

    it('offers the sign-in for an Auth Required connector; its tools appear once it completes', async () => {
      const { api, signInServer } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      await openIndividual(user);

      await open(user, /^Registered servers — /);
      await open(user, /^pro — sign in to see its tools/);
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
      await waitFor(() =>
        expect(signInServer).toHaveBeenCalledWith('pro', 'gazelle'),
      );
      expect(
        await screen.findByRole('checkbox', { name: 'Tool x_pro_list_boards' }),
      ).toBeInTheDocument();
      // And the grid can now enumerate its read-only tools.
      expect(access('pro', 'Read-only')).toBeEnabled();
    });

    it("copies an existing agent's toolset, presets included", async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({
        api,
        agents: [
          agentWithToolset(
            'existing-agent',
            'preset:read-only,workflow:incident-triage',
          ),
        ],
      });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      await openIndividual(user);
      await user.click(screen.getByText("Copy another agent's toolset"));
      await user.click(
        await screen.findByRole('radio', {
          name: 'Copy the toolset of Existing agent',
        }),
      );

      expect(toolsetOutput()).toBe(
        'preset:read-only | workflow:incident-triage',
      );
      expect(level('Look things up')).toBeChecked();
      expect(
        within(catalogueCard()).getByRole('button', {
          name: 'Workflows — 1 workflow · 1 selected',
        }),
      ).toBeInTheDocument();
    });

    it('caps inline selectors at 32 and asks for a preset', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      const tooMany = Array.from(
        { length: 33 },
        (_, i) => `tool:x_srv_t${i}`,
      ).join(',');
      await renderStep({ api, agents: [agentWithToolset('wide', tooMany)] });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      await openIndividual(user);
      await user.click(screen.getByText("Copy another agent's toolset"));
      await user.click(
        await screen.findByRole('radio', {
          name: 'Copy the toolset of Existing agent',
        }),
      );

      expect(
        screen.getByText('Too many selectors — define a preset'),
      ).toBeInTheDocument();
      expect(screen.getByText('Fix the toolset to continue.')).toBeVisible();
      expect(continueButton()).toBeDisabled();
    });

    it("adds a selector by name, a second preset too, and surfaces muster's unknown-preset error", async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Look things up'));
      await openIndividual(user);

      await user.type(screen.getByLabelText('Selector'), 'preset:foo');
      await user.click(screen.getByRole('button', { name: 'Add selector' }));

      expect(toolsetOutput()).toBe('preset:read-only | preset:foo');
      // Two presets are no radio answer: shown as own picks, rewritten never.
      expect(level('Only the tools I choose below')).toBeChecked();
      expect(
        await screen.findByText(
          'The toolset names a preset this environment does not define',
        ),
      ).toBeInTheDocument();

      await user.type(screen.getByLabelText('Selector'), 'toolset:shared');
      await user.click(screen.getByRole('button', { name: 'Add selector' }));
      expect(
        screen.getByText(/reserved for shared toolsets/),
      ).toBeInTheDocument();
      expect(toolsetOutput()).toBe('preset:read-only | preset:foo');
    });

    it('resolves the selection in the Toolset list, with the destructive marker', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Look things up'));
      await openIndividual(user);
      await open(user, /^Infrastructure — /);
      await open(user, /^kubernetes \(family\) — 2 tools/);
      await user.click(
        screen.getByRole('checkbox', { name: 'Tool x_kubernetes_delete_pod' }),
      );

      expect(toolsetOutput()).toBe(
        'preset:read-only | tool:x_kubernetes_delete_pod',
      );
      await waitFor(() =>
        expect(
          within(toolsetCard()).getByText('x_kubernetes_delete_pod'),
        ).toBeInTheDocument(),
      );
      expect(
        within(toolsetCard()).getByText('destructive'),
      ).toBeInTheDocument();
      expect(
        await within(summaryBar()).findByText('Resolves to 3 tools for you'),
      ).toBeInTheDocument();
    });
  });

  describe('the Selected rail', () => {
    let layout: MockedLayout;
    beforeEach(() => {
      layout = mockDesktopLayout();
    });
    afterEach(() => layout.restore());

    it('lists the selection by connector beside the step, with how many tools change things', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();

      const rail = screen.getByRole('complementary', { name: 'Selected' });
      // The rail replaces the narrow summary bar.
      expect(
        screen.queryByRole('region', { name: 'Selected so far' }),
      ).not.toBeInTheDocument();
      expect(within(rail).getByText('No tools')).toBeInTheDocument();

      await user.click(level('Look things up'));
      await user.click(access('agent-manager', 'All'));
      await user.click(access('kubernetes', 'Read-only'));

      expect(
        within(within(rail).getByRole('list', { name: 'Access' })).getByText(
          'Read-only tools',
        ),
      ).toBeInTheDocument();
      expect(
        within(
          within(rail).getByRole('list', { name: 'agent-manager' }),
        ).getByText('All tools, also ones added later'),
      ).toBeInTheDocument();
      expect(
        within(
          within(rail).getByRole('list', { name: 'kubernetes' }),
        ).getByText('get_pods'),
      ).toBeInTheDocument();
      // get_pods, the workflow, create_agent: one of them changes things —
      // said plainly, without claiming the agent asks first.
      expect(await within(rail).findByText('3 tools')).toBeInTheDocument();
      expect(
        within(rail).getByText('1 of them change things'),
      ).toBeInTheDocument();
      expect(within(rail).queryByText(/asks/)).not.toBeInTheDocument();

      await user.click(
        within(rail).getByRole('button', {
          name: 'Remove all of agent-manager',
        }),
      );
      expect(toolsetOutput()).toBe(
        'preset:read-only | tool:x_kubernetes_get_pods',
      );
      expect(access('agent-manager', 'All')).not.toBeChecked();
    });

    it('opens the resolved list from the rail', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Look things up'));

      await user.click(
        screen.getByRole('button', { name: 'Show the resolved list' }),
      );
      expect(
        screen.getByRole('heading', { name: 'Toolset' }),
      ).toBeInTheDocument();
    });
  });

  describe('editing an agent', () => {
    it('shows a preset with a connector’s read-only tools as such, without opening the catalogue', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({
        api,
        toolset: ['preset:infrastructure', 'tool:x_kubernetes_get_pods'],
      });
      await connectorsListed();

      await waitFor(() => expect(level('Infrastructure')).toBeChecked());
      expect(access('kubernetes', 'Read-only')).toBeChecked();
      expect(
        screen.queryByRole('heading', { name: 'Individual tools' }),
      ).not.toBeInTheDocument();
      expect(toolsetOutput()).toBe(
        'preset:infrastructure | tool:x_kubernetes_get_pods',
      );
    });

    it('shows several presets and a workflow as own picks, opens the catalogue, and rewrites nothing', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({
        api,
        toolset: [
          'preset:read-only',
          'preset:infrastructure',
          'workflow:incident-triage',
        ],
      });
      await connectorsListed();

      await waitFor(() =>
        expect(level('Only the tools I choose below')).toBeChecked(),
      );
      expect(
        await screen.findByRole('heading', { name: 'Individual tools' }),
      ).toBeInTheDocument();
      expect(
        within(summaryBar()).getByTitle('preset:infrastructure'),
      ).toBeInTheDocument();
      expect(toolsetOutput()).toBe(
        'preset:read-only | preset:infrastructure | workflow:incident-triage',
      );
    });

    it('shows an agent declaring no tools as Nothing outside the chat', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api, toolset: [], chatOnly: true });
      await connectorsListed();

      expect(level('Nothing outside the chat')).toBeChecked();
      expect(access('kubernetes', 'All')).toBeDisabled();
    });
  });
});
