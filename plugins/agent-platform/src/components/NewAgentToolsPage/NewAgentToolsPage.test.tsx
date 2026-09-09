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

import { agentsRouteRef } from '../../routes';
import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { NewAgentToolsPage } from './NewAgentToolsPage';

// Header actions land in the shared plugin header, outside this tree; the page
// renders the same actions in its footer card, which is what is asserted.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: jest.fn(),
}));

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

/** The toolset copies of the gateway server the fixture agents bind. */
const REMOTE_SERVERS: RemoteMCPServer[] = [];

function agentWithToolset(name: string, toolset: string) {
  REMOTE_SERVERS.push(
    new RemoteMCPServer(
      {
        apiVersion: 'kagent.dev/v1alpha3',
        kind: 'RemoteMCPServer',
        metadata: { name: `muster-${name}`, namespace: 'kagent' },
        spec: {
          url: 'http://muster:8090/mcp',
          headersFrom: [{ name: 'X-Muster-Toolset', value: toolset }],
        },
      },
      'gazelle',
    ),
  );
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha3',
      kind: 'AgentTemplate',
      metadata: {
        name,
        namespace: 'kagent',
        annotations: { 'ui.giantswarm.io/display-name': 'Existing agent' },
      },
      spec: {
        modelConfig: { name: 'opus' },
        tools: [
          {
            mcp: {
              server: { kind: 'RemoteMCPServer', name: `muster-${name}` },
            },
          },
        ],
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
};

/**
 * A muster that resolves toolsets against the fixture the way the real one
 * would: presets by annotation, `server:` by the tool's server, `tool:` and
 * `workflow:` by name, within what the session can see. `pro`'s tool is
 * visible only after the sign-in.
 */
function makeMusterApi(scenario: Scenario) {
  const base = [...TOOLS, ...(scenario.extraTools ?? [])];
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
  } = {},
) {
  mockUseResources.mockImplementation(
    (_clusters: string[], ResourceClass: unknown) => {
      if (ResourceClass === MCPServer) {
        return { resources: SERVER_CRS, isLoading: false, errors: [] };
      }
      if (ResourceClass === RemoteMCPServer) {
        return { resources: REMOTE_SERVERS, isLoading: false, errors: [] };
      }
      if (ResourceClass === Agent) {
        return {
          resources: options.agents ?? [],
          isLoading: false,
          errors: [],
        };
      }
      return { resources: [], isLoading: false, errors: [] };
    },
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <NewAgentFormProvider>
        <Seed>
          <NewAgentToolsPage />
          <ToolsetProbe />
        </Seed>
      </NewAgentFormProvider>
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
/**
 * The Toolset card, where the full resolution renders. Assertions on resolved
 * tool names are scoped to it: the same names sit in the catalogue's rows once
 * a group is open, which `getByText` does not filter out.
 */
const toolsetCard = () =>
  screen.getByRole('heading', { name: 'Toolset' }).parentElement!
    .parentElement as HTMLElement;
/** The sticky *Selected so far* bar. */
const summaryBar = () =>
  screen.getByRole('region', { name: 'Selected so far' });

/** The catalogue is behind a toggle; every group inside it is collapsed. */
async function browseCatalogue(user: UserEvent) {
  await user.click(
    await screen.findByRole('button', { name: 'Browse the catalogue' }),
  );
}
async function open(user: UserEvent, name: RegExp) {
  await user.click(await screen.findByRole('button', { name }));
}

describe('NewAgentToolsPage', () => {
  let windowOpen: jest.SpyInstance;
  beforeEach(() => {
    mockUseResources.mockReset();
    // jsdom has no window.open; null is the popup-blocked answer the sign-in
    // hook tolerates.
    windowOpen = jest.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    windowOpen.mockRestore();
  });

  it('starts with nothing selected, which is No tools: Continue is enabled and the step says so, without a No tools card', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();

    expect(screen.getByText('Step 2 of 3: Tools')).toBeInTheDocument();
    expect(toolsetOutput()).toBe('');
    expect(continueButton()).toBeEnabled();
    expect(
      within(summaryBar()).getByText(/Nothing added yet/),
    ).toBeInTheDocument();
    expect(within(summaryBar()).getByText('No tools')).toBeInTheDocument();
    expect(
      within(summaryBar()).getByText(/Nothing selected: the agent works from/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing selected: the agent is created without tools/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nothing is selected, so this is a chat-only agent/),
    ).toBeInTheDocument();
    await screen.findByRole('checkbox', { name: 'Preset Read-only tools' });
    expect(
      screen.queryByRole('checkbox', { name: 'Preset No tools' }),
    ).not.toBeInTheDocument();

    // A choice, then taking it back, is No tools again.
    await user.click(
      screen.getByRole('checkbox', { name: 'Preset Read-only tools' }),
    );
    expect(toolsetOutput()).toBe('preset:read-only');
    expect(
      within(summaryBar()).queryByText('No tools'),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Remove preset:read-only' }),
    );
    expect(toolsetOutput()).toBe('');
    expect(continueButton()).toBeEnabled();
    expect(within(summaryBar()).getByText('No tools')).toBeInTheDocument();
  });

  it('treats preset:none typed by hand or copied as the empty selection', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({
      api,
      agents: [agentWithToolset('chat-only', 'preset:none')],
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Preset Read-only tools' }),
    );
    await user.type(screen.getByLabelText('Selector'), 'preset:none');
    await user.click(screen.getByRole('button', { name: 'Add selector' }));
    expect(toolsetOutput()).toBe('');
    expect(within(summaryBar()).getByText('No tools')).toBeInTheDocument();

    // The agent without tools is offered as a source and matches the empty
    // selection; copying it keeps the selection empty.
    const source = screen.getByRole('radio', {
      name: 'Copy the toolset of Existing agent',
    });
    expect(source).toBeChecked();
    await user.click(
      screen.getByRole('checkbox', { name: 'Preset Read-only tools' }),
    );
    expect(source).not.toBeChecked();
    await user.click(source);
    expect(toolsetOutput()).toBe('');
    expect(continueButton()).toBeEnabled();
  });

  it('lands compact: presets and the summary, the catalogue behind its toggle with an inventory, no group open', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();

    expect(
      await screen.findByRole('button', { name: 'Browse the catalogue' }),
    ).toHaveAttribute('aria-expanded', 'false');
    // 3 CRs (kubernetes family, agent-manager, pro), 3 server tools + 1 core
    // tool, 1 workflow.
    expect(
      screen.getByText('3 servers · 4 tools · 1 workflow'),
    ).toBeInTheDocument();
    // Nothing of the catalogue is rendered yet — not a group, not a row.
    expect(
      screen.queryByRole('button', { name: /^Infrastructure/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /^(Tool|Workflow|Server) / }),
    ).not.toBeInTheDocument();
    // The search box is there before the catalogue is.
    expect(screen.getByLabelText('Search tools')).toBeInTheDocument();

    await browseCatalogue(user);

    // The four groups, collapsed, each saying what it holds.
    expect(
      screen.getByRole('button', {
        name: 'Infrastructure — 1 server · 2 tools',
      }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', {
        name: 'Agent Platform — 1 server · 1 tool · 1 platform administration tool',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Registered servers — 1 server · 1 awaiting sign-in',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Workflows — 1 workflow' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: /^(Tool|Workflow|Server) / }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Hide the catalogue' }),
    );
    expect(
      screen.queryByRole('button', { name: /^Infrastructure/ }),
    ).not.toBeInTheDocument();
  });

  it("offers muster's presets safe-first with Full gateway last and warned", async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });

    const presets = await screen.findByRole('group', { name: 'Presets' });
    await waitFor(() =>
      expect(
        within(presets)
          .getAllByRole('checkbox')
          .map(card => card.getAttribute('aria-label')),
      ).toEqual([
        'Preset Read-only tools',
        'Preset Infrastructure',
        'Preset Full gateway',
      ]),
    );
    expect(within(presets).getByText(/recommended/)).toBeInTheDocument();
    expect(
      within(presets).getByText(/Warning: the agent can discover/),
    ).toBeInTheDocument();
    // muster's own description of a built-in wins over the fallback copy.
    expect(
      within(presets).getByText('Read-only, from muster'),
    ).toBeInTheDocument();
  });

  it('shows the resolved count in the summary and the resolved list for a preset, with read-only and destructive markers', async () => {
    const { api, filterTools } = makeMusterApi({
      signedIn: false,
      evaluatesToolsets: true,
    });
    await renderStep({ api });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Preset Read-only tools' }),
    );

    // The effect, where the author is looking: the summary under the presets.
    expect(
      await within(summaryBar()).findByText('Resolves to 2 tools for you'),
    ).toBeInTheDocument();
    expect(
      within(summaryBar()).getByRole('listitem', { name: '' }),
    ).toHaveTextContent('preset:read-only');

    const resolved = within(toolsetCard());
    await resolved.findByText('x_kubernetes_get_pods');
    expect(resolved.getByText('workflow_incident-triage')).toBeInTheDocument();
    expect(
      resolved.queryByText('x_kubernetes_delete_pod'),
    ).not.toBeInTheDocument();
    expect(resolved.getAllByText('read-only').length).toBeGreaterThan(0);
    expect(filterTools).toHaveBeenCalledWith(
      expect.objectContaining({
        installation: 'gazelle',
        toolset: ['preset:read-only'],
      }),
    );
  });

  it('shows the live resolution while composing: a preset plus one picked tool', async () => {
    const { api, filterTools } = makeMusterApi({
      signedIn: false,
      evaluatesToolsets: true,
    });
    await renderStep({ api });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Preset Read-only tools' }),
    );
    await within(toolsetCard()).findByText('x_kubernetes_get_pods');

    // Open the catalogue, the Infrastructure group, the kubernetes family, and
    // pick the destructive tool from its rows.
    await browseCatalogue(user);
    await open(user, /^Infrastructure — /);
    await open(user, /^kubernetes \(family\) — 2 tools/);
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Tool x_kubernetes_delete_pod',
      }),
    );

    expect(toolsetOutput()).toBe(
      'preset:read-only | tool:x_kubernetes_delete_pod',
    );
    await waitFor(() =>
      expect(filterTools).toHaveBeenCalledWith(
        expect.objectContaining({
          toolset: ['preset:read-only', 'tool:x_kubernetes_delete_pod'],
        }),
      ),
    );
    // The pick is counted on the collapsed-able triggers and in the summary.
    expect(
      screen.getByRole('button', {
        name: 'Infrastructure — 1 server · 2 tools · 1 selected',
      }),
    ).toBeInTheDocument();
    expect(
      await within(summaryBar()).findByText('Resolves to 3 tools for you'),
    ).toBeInTheDocument();
    // The resolution card lists the destructive tool, marked.
    await waitFor(() =>
      expect(
        within(toolsetCard()).getByText('x_kubernetes_delete_pod'),
      ).toBeInTheDocument(),
    );
    expect(within(toolsetCard()).getByText('destructive')).toBeInTheDocument();
  });

  it('lists every registered server regardless of the viewer’s auth state, grouped by the label, each group opening to its rows', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();
    await browseCatalogue(user);

    // Infrastructure: the family, one row across its members.
    await open(user, /^Infrastructure — /);
    expect(
      screen.getByRole('button', { name: /^kubernetes \(family\) — 2 tools/ }),
    ).toBeInTheDocument();
    // Agent Platform: the labelled server, plus the warned core tools — both
    // collapsed until opened.
    await open(user, /^Agent Platform — /);
    expect(
      screen.getByRole('button', { name: /^agent-manager — 1 tool/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('These tools manage the platform itself'),
    ).not.toBeInTheDocument();
    await open(user, /^Platform administration — 1 tool of muster itself/);
    expect(
      screen.getByText('These tools manage the platform itself'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Tool core_service_list' }),
    ).toBeInTheDocument();
    // Registered servers: the unlabelled one the viewer has not signed in to
    // is a row all the same.
    await open(user, /^Registered servers — /);
    expect(
      screen.getByRole('button', { name: /^pro — sign in to see its tools/ }),
    ).toBeInTheDocument();
    // Workflows are their own group; few enough for a plain list.
    await open(user, /^Workflows — 1 workflow/);
    expect(
      screen.getByRole('checkbox', { name: 'Workflow incident-triage' }),
    ).toBeInTheDocument();
  });

  it('a search opens only the groups with matches, and clearing it puts the catalogue away again', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Search tools'), 'pods');

    // No click needed: the Infrastructure group and the family are open and
    // the matching row is there; the other groups are gone.
    expect(
      await screen.findByRole('checkbox', {
        name: 'Tool x_kubernetes_get_pods',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Infrastructure — / }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.queryByRole('button', { name: /^Workflows — / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Tool x_kubernetes_delete_pod' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('1 tool and 0 workflows match'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Show everything again' }),
    );

    expect(
      screen.queryByRole('checkbox', { name: 'Tool x_kubernetes_get_pods' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Browse the catalogue' }),
    ).toBeInTheDocument();
  });

  it('shows the first 20 rows of a long list and the rest on request', async () => {
    const { api } = makeMusterApi({
      signedIn: false,
      evaluatesToolsets: true,
      extraTools: GITHUB_TOOLS,
    });
    await renderStep({ api });
    const user = userEvent.setup();

    await browseCatalogue(user);
    await open(
      user,
      /^Registered servers — 2 servers · 25 tools · 1 awaiting sign-in/,
    );
    await open(user, /^github — 25 tools/);

    expect(
      screen.getAllByRole('checkbox', { name: /^Tool x_github_/ }),
    ).toHaveLength(20);
    expect(screen.getByText('20 tools shown, 5 more')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show all 25 tools' }));

    expect(
      screen.getAllByRole('checkbox', { name: /^Tool x_github_/ }),
    ).toHaveLength(25);
    expect(
      screen.queryByRole('button', { name: /^Show all/ }),
    ).not.toBeInTheDocument();
  });

  it('groups many workflows by their name prefix, each collapsed with its count, singletons gathered', async () => {
    const { api } = makeMusterApi({
      signedIn: false,
      evaluatesToolsets: true,
      extraTools: MANY_WORKFLOWS,
    });
    await renderStep({ api });
    const user = userEvent.setup();

    await browseCatalogue(user);
    await open(user, /^Workflows — 14 workflows/);

    // The shared prefix names the group — the longest one, so `cert-manager`
    // rather than `cert` — and the two workflows nothing else shares a prefix
    // with sit under Other workflows, last.
    expect(
      screen
        .getAllByRole('button', { name: / — \d+ workflows?$/ })
        .map(button => button.textContent),
    ).toEqual([
      'Workflows — 14 workflows',
      'cert-manager — 2 workflows',
      'flux — 2 workflows',
      'kube — 3 workflows',
      'mc — 3 workflows',
      'wc — 2 workflows',
      'Other workflows — 2 workflows',
    ]);
    expect(
      screen.queryByRole('checkbox', { name: /^Workflow / }),
    ).not.toBeInTheDocument();

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
    // Rows carry the markers and one line of the description.
    expect(screen.getAllByText('read-only').length).toBeGreaterThanOrEqual(3);
    expect(
      screen.getByRole('checkbox', { name: 'Workflow mc-api-down' }),
    ).toHaveAttribute('title', 'Triage mc-api-down');

    await open(user, /^Other workflows — 2 workflows/);
    expect(
      screen.getByRole('checkbox', { name: 'Workflow lonely-one' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Workflow incident-triage' }),
    ).toBeInTheDocument();
  });

  it('offers the sign-in for an Auth Required server inline; its tools appear once the sign-in completes', async () => {
    const { api, signInServer, listTools } = makeMusterApi({
      signedIn: false,
      evaluatesToolsets: true,
    });
    await renderStep({ api });
    const user = userEvent.setup();

    await browseCatalogue(user);
    await open(user, /^Registered servers — /);
    await open(user, /^pro — sign in to see its tools/);
    expect(
      await screen.findByText('Sign in to see the tools of pro'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Tool x_pro_list_boards' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(signInServer).toHaveBeenCalledWith('pro', 'gazelle'),
    );
    // The catalogue re-reads (the `['muster']` invalidation) and pro's tool
    // becomes a selectable row.
    expect(
      await screen.findByRole('checkbox', { name: 'Tool x_pro_list_boards' }),
    ).toBeInTheDocument();
    expect(listTools.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole('button', { name: /^pro — 1 tool/ }),
    ).toBeInTheDocument();
  });

  it('lets a whole unsigned server be selected, flagged, while its tools cannot be picked', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();

    await browseCatalogue(user);
    await open(user, /^Registered servers — /);
    await open(user, /^pro — sign in to see its tools/);
    await user.click(
      await screen.findByRole('checkbox', { name: 'Server pro' }),
    );

    expect(toolsetOutput()).toBe('server:pro');
    expect(continueButton()).toBeEnabled();
    // Flagged in the panel, in the toolset card and in the summary.
    expect(
      screen.getAllByText(/Selected without a sign-in/).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole('button', {
        name: /^pro — sign in to see its tools · whole server selected/,
      }),
    ).toBeInTheDocument();
    // Nothing to pick: no tool rows for a server whose tools are not listed.
    expect(
      screen.queryByRole('checkbox', { name: /^Tool x_pro_/ }),
    ).not.toBeInTheDocument();
    // And muster reports the selector as matching nothing for this viewer.
    expect(
      await screen.findByText('Some selectors match nothing for you'),
    ).toBeInTheDocument();
    expect(
      within(summaryBar()).getByText(
        '1 server selected without a sign-in · 1 selector match nothing for you',
      ),
    ).toBeInTheDocument();
  });

  it("copies an existing agent's toolset into the step", async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
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

    await user.click(
      await screen.findByRole('radio', {
        name: 'Copy the toolset of Existing agent',
      }),
    );

    expect(toolsetOutput()).toBe('preset:read-only | workflow:incident-triage');
    expect(continueButton()).toBeEnabled();
    expect(
      screen.getByRole('checkbox', { name: 'Preset Read-only tools' }),
    ).toBeChecked();
    await browseCatalogue(user);
    expect(
      screen.getByRole('button', {
        name: 'Workflows — 1 workflow · 1 selected',
      }),
    ).toBeInTheDocument();
    await open(user, /^Workflows — /);
    expect(
      screen.getByRole('checkbox', { name: 'Workflow incident-triage' }),
    ).toBeChecked();
  });

  it('caps inline selectors at 32 and asks for a preset', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    const tooMany = Array.from(
      { length: 33 },
      (_, i) => `tool:x_srv_t${i}`,
    ).join(',');
    await renderStep({ api, agents: [agentWithToolset('wide', tooMany)] });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('radio', {
        name: 'Copy the toolset of Existing agent',
      }),
    );

    expect(
      screen.getByText('Too many selectors — define a preset'),
    ).toBeInTheDocument();
    expect(
      within(summaryBar()).getByText('The toolset cannot be applied as it is'),
    ).toBeInTheDocument();
    expect(continueButton()).toBeDisabled();
  });

  it("surfaces muster's unknown-preset error for a selector typed by hand", async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Selector'), 'preset:foo');
    await user.click(screen.getByRole('button', { name: 'Add selector' }));

    expect(toolsetOutput()).toBe('preset:foo');
    expect(
      await screen.findByText(
        'The toolset names a preset this installation does not define',
      ),
    ).toBeInTheDocument();
    // In the card and in the summary.
    expect(screen.getAllByText(/unknown preset "foo"/).length).toBe(2);
  });

  it('refuses a malformed or reserved selector typed by hand', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Selector'), 'toolset:shared');
    await user.click(screen.getByRole('button', { name: 'Add selector' }));

    expect(
      screen.getByText(/reserved for shared toolsets/),
    ).toBeInTheDocument();
    expect(toolsetOutput()).toBe('');
  });

  it('degrades honestly against a muster that does not evaluate toolsets yet', async () => {
    const { api } = makeMusterApi({
      signedIn: false,
      evaluatesToolsets: false,
    });
    await renderStep({ api });
    const user = userEvent.setup();

    // Only the built-ins can be offered, and the page says why.
    expect(
      await screen.findByText('Only the built-in presets are known'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Preset Infrastructure' }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('checkbox', { name: 'Preset Read-only tools' }),
    );

    // The unscoped answer is not presented as the resolution — in the card
    // and in the summary.
    expect(
      await screen.findAllByText(
        "This installation's muster does not evaluate toolsets yet",
      ),
    ).toHaveLength(2);
    // The declaration is still made and the flow can continue.
    expect(toolsetOutput()).toBe('preset:read-only');
    expect(continueButton()).toBeEnabled();
  });

  it('degrades to the built-in preset names where the muster plugin is not installed', async () => {
    await renderStep();
    const user = userEvent.setup();

    expect(
      await screen.findByText('The catalogue is not available in this portal'),
    ).toBeInTheDocument();
    const presets = screen.getByRole('group', { name: 'Presets' });
    expect(
      within(presets)
        .getAllByRole('checkbox')
        .map(card => card.getAttribute('aria-label')),
    ).toEqual(['Preset Read-only tools', 'Preset Full gateway']);
    expect(continueButton()).toBeEnabled();

    await user.click(
      screen.getByRole('checkbox', { name: 'Preset Full gateway' }),
    );

    expect(toolsetOutput()).toBe('preset:full');
    expect(screen.getAllByText('Full gateway access').length).toBeGreaterThan(
      0,
    );
    expect(continueButton()).toBeEnabled();
  });

  it('keeps full exclusive of everything else; an emptied selection is No tools again', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Preset Read-only tools' }),
    );
    await user.click(
      screen.getByRole('checkbox', { name: 'Preset Full gateway' }),
    );
    expect(toolsetOutput()).toBe('preset:full');

    await browseCatalogue(user);
    await open(user, /^Workflows — /);
    await user.click(
      screen.getByRole('checkbox', { name: 'Workflow incident-triage' }),
    );
    expect(toolsetOutput()).toBe('workflow:incident-triage');

    // Removed from the summary bar's chips: back to No tools, still a valid answer.
    await user.click(
      screen.getByRole('button', { name: 'Remove workflow:incident-triage' }),
    );
    expect(toolsetOutput()).toBe('');
    expect(continueButton()).toBeEnabled();
    expect(within(summaryBar()).getByText('No tools')).toBeInTheDocument();
  });
});
