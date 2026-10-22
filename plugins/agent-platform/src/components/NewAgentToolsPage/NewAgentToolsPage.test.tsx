import { ReactNode, useEffect, useState } from 'react';
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

import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import {
  mockDesktopLayout,
  type MockedLayout,
} from '@giantswarm/backstage-plugin-ui-react/testUtils';

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
  /** A resolution muster refuses for another reason than the cap. */
  resolutionFails?: string;
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
    if (scenario.resolutionFails) {
      throw new Error(scenario.resolutionFails);
    }
    // Muster's own inline cap, refused with the whole selector list.
    if (selectors.length > 32) {
      throw new Error(
        `toolset [${selectors.join(',')}] has ${
          selectors.length
        } selectors, more than the 32 allowed inline; define a preset`,
      );
    }
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
  defaultWorkspace: '',
  selectedSkills: [],
  keptSkills: [],
  selectedPlugins: [],
  keptPlugins: [],
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

/**
 * The step with a way to leave it and come back, as Back and a stepper link
 * do: the step unmounts while the form provider above it stays.
 */
function RoundTrip() {
  const [shown, setShown] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setShown(value => !value)}>
        {shown ? 'Leave the step' : 'Return to the step'}
      </button>
      {shown && <NewAgentToolsPage />}
    </>
  );
}

async function renderStep(
  options: {
    /** Renders a control that unmounts the step and mounts it again. */
    roundTrip?: boolean;
    api?: MusterApi;
    agents?: Agent[];
    /** The wizard's state when it opens, for the edit-mode round trip. */
    toolset?: string[];
    chatOnly?: boolean;
    /** The installation's MCPServer CRs, when not {@link SERVER_CRS}. */
    servers?: MCPServer[];
  } = {},
) {
  mockUseResources.mockImplementation(
    (_clusters: string[], ResourceClass: unknown) => {
      if (ResourceClass === MCPServer) {
        return {
          resources: options.servers ?? SERVER_CRS,
          isLoading: false,
          errors: [],
        };
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
            {options.roundTrip ? <RoundTrip /> : <NewAgentToolsPage />}
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
    { mountedRoutes: { '/customize/agents': agentsRouteRef } },
  );
}

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

/**
 * Continue stays pressable over a toolset problem: pressed, it moves the focus
 * to the problem instead of leaving the step.
 */
async function expectContinueBlocked(user: ReturnType<typeof userEvent.setup>) {
  expect(continueButton()).toBeEnabled();
  await user.click(continueButton());
  // The toolset's problem where the Toolset section shows it, else the line
  // by Continue that says the step is blocked.
  expect(document.activeElement).toHaveTextContent(
    /selectors|Fix the toolset to continue/,
  );
  // Still on the step.
  expect(
    screen.getByRole('heading', { name: 'What may it do?' }),
  ).toBeInTheDocument();
}
const toolsetOutput = () => screen.getByTestId('toolset').textContent;
/** The narrow-layout *Selected so far* bar (jsdom has no two-column viewport). */
const summaryBar = () =>
  screen.getByRole('region', { name: 'Selected so far' });
/** The access-level radio. */
const levels = () => screen.getByRole('radiogroup', { name: 'What it may do' });
const level = (name: string) => within(levels()).getByRole('radio', { name });
/** One connector of *Which connectors?*. */
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
          'Read-only tools',
          'Infrastructure',
          'Full gateway',
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

      await ownPicks(user);
      await user.click(access('kubernetes', 'All'));
      expect(toolsetOutput()).toBe('server:kubernetes');

      await user.click(level('Nothing outside the chat'));
      expect(toolsetOutput()).toBe('');
      expect(access('kubernetes', 'All')).toBeDisabled();
      expect(access('kubernetes', 'All')).not.toBeChecked();
      expect(individualToggle()).toBeDisabled();

      await user.click(level('Infrastructure'));
      expect(toolsetOutput()).toBe('preset:infrastructure');
      await waitFor(() => expect(access('kubernetes', 'All')).toBeEnabled());
      expect(individualToggle()).toBeEnabled();
    });

    it('shows what a preset covers, and writes it out on the first change below', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();

      // A preset replaces whatever was picked.
      await ownPicks(user);
      await user.click(access('agent-manager', 'All'));
      await user.click(level('Read-only tools'));
      expect(toolsetOutput()).toBe('preset:read-only');

      // Read-only covers kubernetes' one read-only tool: shown as Read-only.
      await waitFor(() =>
        expect(access('kubernetes', 'Read-only')).toBeChecked(),
      );
      expect(access('agent-manager', 'All')).not.toBeChecked();
      expect(
        screen.getByText(
          'Changing anything below switches to Only the tools I choose below, and removing something this preset covers also drops connectors you are not signed in to.',
        ),
      ).toBeInTheDocument();
      // Untouched, the toolset stays the preset (it follows the gateway).
      expect(toolsetOutput()).toBe('preset:read-only');

      // Taking part of the preset away writes it out ("the preset minus x"
      // has no selector) and applies itself.
      await user.click(access('kubernetes', 'Read-only'));
      expect(toolsetOutput()).toBe('workflow:incident-triage');
      expect(level('Only the tools I choose below')).toBeChecked();

      // Infrastructure covers every kubernetes tool: shown as All; switching
      // to own picks keeps what it showed, written out.
      await user.click(level('Infrastructure'));
      expect(toolsetOutput()).toBe('preset:infrastructure');
      await waitFor(() => expect(access('kubernetes', 'All')).toBeChecked());
      await user.click(level('Only the tools I choose below'));
      expect(toolsetOutput()).toBe('server:kubernetes');
    });

    it('keeps the selection off under Full gateway, and starts own picks empty from it', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();

      await user.click(level('Full gateway'));
      expect(toolsetOutput()).toBe('preset:full');
      expect(
        screen.getByText('Full gateway includes every tool.'),
      ).toBeInTheDocument();
      expect(access('kubernetes', 'All')).toBeDisabled();
      expect(individualToggle()).toBeDisabled();
      expect(screen.getAllByText('Full gateway access').length).toBeGreaterThan(
        0,
      );

      await user.click(level('Only the tools I choose below'));
      expect(toolsetOutput()).toBe('');
      expect(access('kubernetes', 'All')).toBeEnabled();
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
      expect(level('Read-only tools')).toBeInTheDocument();

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

      await user.click(level('Read-only tools'));

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
        'Read-only tools',
        'Full gateway',
        'Only the tools I choose below',
      ]);
      expect(
        screen.getByText('Connectors cannot be listed in this portal.'),
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
      expect(connector('kubernetes')).toHaveTextContent(/^kubernetes/);
      expect(connector('kubernetes')).not.toHaveTextContent('(family)');
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
        '2 tools, including ones added later',
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
      await open(user, /^kubernetes — 2 tools/);
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

  describe('a compact toolset (B1)', () => {
    /** 40 read-only connectors, listed after the fixture's three: the read-only
     * preset written out is 42 selectors. */
    const MANY_READ_ONLY: ToolSummary[] = Array.from(
      { length: 40 },
      (_, i) => ({
        name: `x_svc${String(i).padStart(2, '0')}_get`,
        summary: `App ${i}`,
        server: `svc${String(i).padStart(2, '0')}`,
        kind: 'tool' as const,
        annotations: { readOnlyHint: true },
      }),
    );

    it('keeps a broad preset as the base when one connector gets All', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: MANY_READ_ONLY,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Read-only tools'));
      await waitFor(() =>
        expect(access('kubernetes', 'Read-only')).toBeChecked(),
      );

      // The QA repro: written out, this would be 43 selectors.
      await user.click(access('agent-manager', 'All'));
      expect(toolsetOutput()).toBe('preset:read-only | server:agent-manager');
      expect(level('Only the tools I choose below')).toBeChecked();
      expect(continueButton()).toBeEnabled();
      expect(
        screen.queryByText('Fix the toolset to continue.'),
      ).not.toBeInTheDocument();
      // The grid still shows everything the toolset selects.
      expect(access('agent-manager', 'All')).toBeChecked();
      expect(access('kubernetes', 'Read-only')).toBeChecked();
      expect(access('svc00', 'Read-only')).toBeChecked();

      // A further addition stays on top of the preset.
      await user.click(access('kubernetes', 'All'));
      expect(toolsetOutput()).toBe(
        'preset:read-only | server:agent-manager | server:kubernetes',
      );

      // Back to what the preset covers: the preset alone again.
      await user.click(access('kubernetes', 'Read-only'));
      await user.click(access('agent-manager', 'All'));
      expect(toolsetOutput()).toBe('preset:read-only');
      expect(level('Read-only tools')).toBeChecked();
    });

    it('writes the preset out when part of it is taken away, and names what to reduce over the cap', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: MANY_READ_ONLY,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Read-only tools'));
      await waitFor(() =>
        expect(access('kubernetes', 'Read-only')).toBeChecked(),
      );

      // "Read-only everywhere but kubernetes" has no selector: written out,
      // it is 41 selectors, one per connector plus the workflow.
      await user.click(access('kubernetes', 'Read-only'));
      expect(toolsetOutput()?.split(' | ')).toHaveLength(41);
      await expectContinueBlocked(user);
      expect(
        within(summaryBar()).getByText(
          'This toolset needs 41 selectors but may list at most 32, so choose fewer connectors or tools.',
        ),
      ).toBeInTheDocument();

      // Undoing the change holds everything the preset covers again: the
      // toolset collapses back to it (R2-1), and Continue works again.
      await user.click(access('kubernetes', 'Read-only'));
      expect(toolsetOutput()).toBe('preset:read-only');
      expect(level('Read-only tools')).toBeChecked();
      expect(continueButton()).toBeEnabled();
    });

    it('collapses back to the preset after a round trip through another step (N2)', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: MANY_READ_ONLY,
      });
      await renderStep({ api, roundTrip: true });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Read-only tools'));
      await waitFor(() =>
        expect(access('kubernetes', 'Read-only')).toBeChecked(),
      );
      await user.click(access('kubernetes', 'Read-only'));
      expect(toolsetOutput()?.split(' | ')).toHaveLength(41);

      // Back to another step and here again: the step mounts afresh.
      await user.click(screen.getByRole('button', { name: 'Leave the step' }));
      await user.click(
        screen.getByRole('button', { name: 'Return to the step' }),
      );
      await connectorsListed();

      await user.click(access('kubernetes', 'Read-only'));
      await waitFor(() => expect(toolsetOutput()).toBe('preset:read-only'));
      expect(continueButton()).toBeEnabled();
    });

    it('keeps what was added beside the preset when a change to it is undone', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: MANY_READ_ONLY,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Read-only tools'));
      await waitFor(() =>
        expect(access('kubernetes', 'Read-only')).toBeChecked(),
      );
      await user.click(access('agent-manager', 'All'));
      expect(toolsetOutput()).toBe('preset:read-only | server:agent-manager');

      await user.click(access('kubernetes', 'Read-only'));
      expect(toolsetOutput()).not.toContain('preset:read-only');
      await expectContinueBlocked(user);

      await user.click(access('kubernetes', 'Read-only'));
      expect(toolsetOutput()).toBe('preset:read-only | server:agent-manager');
      expect(level('Only the tools I choose below')).toBeChecked();
      expect(continueButton()).toBeEnabled();
    });

    it('names the connectors that list the most when a selection is over the cap', async () => {
      const wide = (server: string): ToolSummary[] => [
        ...Array.from({ length: 20 }, (_, i) => ({
          name: `x_${server}_get_${String(i).padStart(2, '0')}`,
          summary: `Read ${i}`,
          server,
          kind: 'tool' as const,
          annotations: { readOnlyHint: true },
        })),
        {
          name: `x_${server}_write`,
          summary: 'Write',
          server,
          kind: 'tool' as const,
        },
      ];
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        extraTools: [...wide('alpha'), ...wide('beta')],
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);

      await user.click(access('alpha', 'Read-only'));
      await user.click(access('beta', 'Read-only'));
      await expectContinueBlocked(user);
      expect(
        within(summaryBar()).getByText(
          'This toolset needs 40 selectors but may list at most 32; most come from alpha (20) and beta (20), so choose All or fewer tools there.',
        ),
      ).toBeInTheDocument();

      // All on one of them fits.
      await user.click(access('alpha', 'All'));
      expect(continueButton()).toBeEnabled();
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
          name: /^Registered connectors/,
        }),
      ).not.toBeInTheDocument();

      await user.type(screen.getByLabelText('Search tools'), 'github');
      expect(
        screen.getByText('No tools match “github” with these filters.'),
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
      await open(user, /^kubernetes — 1 tool/);
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
      await open(user, /^Registered connectors — /);
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

      await open(user, /^Registered connectors — /);
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
      // A preset with more beside it is no radio answer: shown as it is.
      expect(level('Only the tools I choose below')).toBeChecked();
      expect(
        within(catalogueCard()).getByRole('button', {
          name: 'Workflows — 1 workflow · 1 selected',
        }),
      ).toBeInTheDocument();
    });

    it('caps inline selectors at 32 and says what to reduce', async () => {
      const { api, filterTools } = makeMusterApi({
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

      expect(screen.getByText('Too many selectors')).toBeInTheDocument();
      expect(
        within(toolsetCard()).getByText(
          'This toolset needs 33 selectors but may list at most 32; most come from other selectors (33), so choose All or fewer tools there.',
        ),
      ).toBeInTheDocument();
      expect(screen.getByText('Fix the toolset to continue.')).toBeVisible();
      await expectContinueBlocked(user);
      // Muster's own refusal, which dumps every selector, is not shown beside it.
      await waitFor(() =>
        expect(filterTools).toHaveBeenCalledWith(
          expect.objectContaining({
            toolset: expect.arrayContaining(['tool:x_srv_t32']),
          }),
        ),
      );
      expect(
        screen.queryByText('Could not resolve the toolset'),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/allowed inline/)).not.toBeInTheDocument();
    });

    it('still shows a resolution error that is not the cap', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        resolutionFails: 'muster is unreachable',
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);
      await openIndividual(user);
      await user.type(screen.getByLabelText('Selector'), 'server:kubernetes');
      await user.click(screen.getByRole('button', { name: 'Add selector' }));

      expect(
        await within(toolsetCard()).findByText('Could not resolve the toolset'),
      ).toBeInTheDocument();
      expect(
        within(toolsetCard()).getByText('muster is unreachable'),
      ).toBeInTheDocument();
    });

    it("adds a selector by name, a preset too, and surfaces muster's unknown-preset error", async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Read-only tools'));
      await waitFor(() => expect(individualToggle()).toBeEnabled());
      await openIndividual(user);

      await user.type(screen.getByLabelText('Selector'), 'preset:foo');
      await user.click(screen.getByRole('button', { name: 'Add selector' }));

      // A change like any other: added on top of the preset.
      expect(toolsetOutput()).toBe('preset:read-only | preset:foo');
      expect(level('Only the tools I choose below')).toBeChecked();
      expect(
        await screen.findByText(
          'The toolset names a preset this environment does not define',
        ),
      ).toBeInTheDocument();

      const selector = screen.getByLabelText('Selector');
      await user.type(selector, 'toolset:shared');
      // Not while it is typed; on leaving the field, on the field itself.
      expect(selector).not.toHaveAttribute('aria-invalid');
      await user.click(screen.getByRole('button', { name: 'Add selector' }));
      expect(selector).toHaveAttribute('aria-invalid', 'true');
      expect(selector).toHaveAccessibleDescription(
        expect.stringMatching(/reserved for shared toolsets/),
      );
      expect(selector).toHaveFocus();
      expect(toolsetOutput()).toBe('preset:read-only | preset:foo');

      await user.clear(selector);
      await user.type(selector, 'server:pro');
      expect(selector).not.toHaveAttribute('aria-invalid');
    });

    it('resolves the selection in the Toolset list, saying it changes things', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Read-only tools'));
      await waitFor(() => expect(individualToggle()).toBeEnabled());
      await openIndividual(user);
      await open(user, /^Infrastructure — /);
      await open(user, /^kubernetes — 2 tools/);
      // The preset's coverage is shown in the catalogue too.
      expect(
        screen.getByRole('checkbox', { name: 'Tool x_kubernetes_get_pods' }),
      ).toBeChecked();
      await user.click(
        screen.getByRole('checkbox', { name: 'Tool x_kubernetes_delete_pod' }),
      );

      // Everything the preset covers is still chosen: it stays the base.
      expect(toolsetOutput()).toBe(
        'preset:read-only | tool:x_kubernetes_delete_pod',
      );
      expect(level('Only the tools I choose below')).toBeChecked();
      await waitFor(() =>
        expect(
          within(toolsetCard()).getByText('x_kubernetes_delete_pod'),
        ).toBeInTheDocument(),
      );
      expect(
        within(toolsetCard()).getByText('Changes things'),
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

      // An untouched preset is listed with what it covers.
      await user.click(level('Read-only tools'));
      expect(
        await within(rail).findByRole('list', { name: 'kubernetes' }),
      ).toHaveTextContent('get_pods');
      expect(
        within(rail).getByRole('list', { name: 'Access' }),
      ).toHaveTextContent('Read-only tools');
      expect(
        within(rail).getByRole('list', { name: 'Workflows' }),
      ).toHaveTextContent('incident-triage');
      expect(await within(rail).findByText('2 tools')).toBeInTheDocument();

      // Added on top: the preset stays listed as the base.
      await user.click(access('agent-manager', 'All'));
      expect(toolsetOutput()).toBe('preset:read-only | server:agent-manager');
      expect(
        within(rail).getByRole('list', { name: 'Access' }),
      ).toHaveTextContent('Read-only tools');
      expect(
        within(rail).getByRole('list', { name: 'agent-manager' }),
      ).toHaveTextContent('All tools, including ones added later');
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
      // Back to the preset alone, which the radio shows as that preset.
      expect(toolsetOutput()).toBe('preset:read-only');
      expect(access('agent-manager', 'All')).not.toBeChecked();
      expect(level('Read-only tools')).toBeChecked();
    });

    it('opens the resolved list from the rail', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await user.click(level('Read-only tools'));

      await user.click(
        screen.getByRole('button', { name: 'Show the resolved list' }),
      );
      expect(
        screen.getByRole('heading', { name: 'Toolset' }),
      ).toBeInTheDocument();
    });
  });

  describe('the sign-in tool', () => {
    /** The rail's and the bar's entry for the sign-in tool the step added. */
    const addedForSignIn = () =>
      within(summaryBar()).queryByRole('group', { name: 'Added for sign-in' });
    const resolvedWith = (filterTools: jest.Mock, toolset: string[]) =>
      waitFor(() =>
        expect(filterTools).toHaveBeenCalledWith(
          expect.objectContaining({ toolset }),
        ),
      );

    it('adds core_auth_login with a connector that needs a sign-in, and drops it with the last one', async () => {
      const { api, filterTools } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api });
      const user = userEvent.setup();
      await connectorsListed();
      await ownPicks(user);

      await user.click(access('pro', 'All'));
      // The person's selection stays theirs; the step adds the tool.
      expect(toolsetOutput()).toBe('server:pro');
      await waitFor(() => expect(addedForSignIn()).toBeInTheDocument());
      expect(addedForSignIn()).toHaveTextContent('core_auth_login');
      expect(addedForSignIn()).toHaveTextContent(
        'Lets the agent start the sign-in to pro.',
      );
      await resolvedWith(filterTools, ['server:pro', 'tool:core_auth_login']);

      // A connector without a sign-in of its own needs nothing more.
      await user.click(access('kubernetes', 'All'));
      expect(addedForSignIn()).toBeInTheDocument();

      await user.click(access('pro', 'All'));
      expect(toolsetOutput()).toBe('server:kubernetes');
      expect(addedForSignIn()).not.toBeInTheDocument();
      await resolvedWith(filterTools, ['server:kubernetes']);
    });

    it('warns once it is removed while a connector still needs it, and puts it back', async () => {
      const { api, filterTools } = makeMusterApi({
        signedIn: true,
        evaluatesToolsets: true,
      });
      await renderStep({ api, toolset: ['tool:x_pro_list_boards'] });
      const user = userEvent.setup();
      await connectorsListed();

      // A tool of the connector needs it as much as the whole connector.
      await waitFor(() => expect(addedForSignIn()).toBeInTheDocument());
      await user.click(
        within(addedForSignIn()!).getByRole('button', {
          name: 'Remove core_auth_login',
        }),
      );
      expect(addedForSignIn()).not.toBeInTheDocument();
      expect(summaryBar()).toHaveTextContent(
        "Without core_auth_login the agent won't be able to sign in to pro.",
      );
      await resolvedWith(filterTools, ['tool:x_pro_list_boards']);

      await user.click(
        within(summaryBar()).getByRole('button', {
          name: 'Add core_auth_login back',
        }),
      );
      expect(addedForSignIn()).toBeInTheDocument();
      expect(summaryBar()).not.toHaveTextContent("won't be able to sign in");
    });

    it('adds nothing where a preset carries it already or the selection names it', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      const first = await renderStep({
        api,
        toolset: ['preset:read-only', 'server:pro'],
      });
      await connectorsListed();
      expect(addedForSignIn()).not.toBeInTheDocument();
      first.unmount();

      await renderStep({
        api,
        toolset: ['server:pro', 'tool:core_auth_login'],
      });
      await connectorsListed();
      expect(addedForSignIn()).not.toBeInTheDocument();
      expect(
        within(summaryBar()).getByTitle('tool:core_auth_login'),
      ).toBeInTheDocument();
    });

    it('adds nothing for a connector muster signs in to with the caller’s own token', async () => {
      const { api, filterTools } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({
        api,
        toolset: ['server:pro', 'server:sso'],
        servers: [
          ...SERVER_CRS.filter(server => server.getName() !== 'pro'),
          mcpServer('pro', { auth: { type: 'oauth', forwardToken: true } }),
          mcpServer('sso', {
            auth: {
              type: 'oauth',
              tokenExchange: {
                enabled: true,
                dexTokenEndpoint: 'https://dex.example.com/token',
                connectorId: 'example',
              },
            },
          }),
        ],
      });
      await connectorsListed();
      await resolvedWith(filterTools, ['server:pro', 'server:sso']);
      expect(addedForSignIn()).not.toBeInTheDocument();
    });
  });

  describe('editing an agent', () => {
    it('shows a preset alone as that preset, its coverage in the grid, without opening the catalogue', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({ api, toolset: ['preset:infrastructure'] });
      await connectorsListed();

      await waitFor(() => expect(level('Infrastructure')).toBeChecked());
      await waitFor(() => expect(access('kubernetes', 'All')).toBeChecked());
      expect(
        screen.queryByRole('heading', { name: 'Individual tools' }),
      ).not.toBeInTheDocument();
      expect(toolsetOutput()).toBe('preset:infrastructure');
    });

    it('shows a preset with more beside it as own picks, the grid showing both, every selector kept', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({
        api,
        toolset: ['preset:infrastructure', 'server:agent-manager'],
      });
      await connectorsListed();

      await waitFor(() =>
        expect(level('Only the tools I choose below')).toBeChecked(),
      );
      expect(access('agent-manager', 'All')).toBeChecked();
      // The preset's part, written out for the grid only.
      await waitFor(() => expect(access('kubernetes', 'All')).toBeChecked());
      expect(
        screen.queryByRole('heading', { name: 'Individual tools' }),
      ).not.toBeInTheDocument();
      expect(
        within(summaryBar()).getByTitle('preset:infrastructure'),
      ).toBeInTheDocument();
      expect(toolsetOutput()).toBe(
        'preset:infrastructure | server:agent-manager',
      );
    });

    it('round-trips a read-only base with a connector on top, and stores a change compactly', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
      });
      await renderStep({
        api,
        toolset: ['preset:read-only', 'server:agent-manager'],
      });
      await connectorsListed();

      await waitFor(() =>
        expect(access('kubernetes', 'Read-only')).toBeChecked(),
      );
      expect(level('Only the tools I choose below')).toBeChecked();
      expect(access('agent-manager', 'All')).toBeChecked();
      expect(toolsetOutput()).toBe('preset:read-only | server:agent-manager');

      const user = userEvent.setup();
      await user.click(access('kubernetes', 'All'));
      expect(toolsetOutput()).toBe(
        'preset:read-only | server:agent-manager | server:kubernetes',
      );
    });

    it('keeps the selection off while the preset beside other selectors is read', async () => {
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
          if (options.toolset?.join() === 'preset:read-only') {
            await gate;
          }
          return api.filterTools(options);
        },
      };
      await renderStep({
        api: gated,
        toolset: ['preset:read-only', 'server:agent-manager'],
      });
      await connectorsListed();

      // Unread, the grid would claim kubernetes is None (R2-2).
      expect(
        await screen.findByText('Reading what the preset covers…'),
      ).toBeInTheDocument();
      expect(access('kubernetes', 'All')).toBeDisabled();
      expect(individualToggle()).toBeDisabled();

      release();

      await waitFor(() =>
        expect(access('kubernetes', 'Read-only')).toBeChecked(),
      );
      expect(access('kubernetes', 'All')).toBeEnabled();
      expect(
        screen.queryByText('Reading what the preset covers…'),
      ).not.toBeInTheDocument();
      expect(toolsetOutput()).toBe('preset:read-only | server:agent-manager');
    });

    it('shows every selector as it is when the preset beside others cannot be read', async () => {
      const { api } = makeMusterApi({
        signedIn: false,
        evaluatesToolsets: true,
        resolutionFails: 'muster is unreachable',
      });
      await renderStep({
        api,
        toolset: ['preset:read-only', 'server:agent-manager'],
      });
      await connectorsListed();

      expect(
        await screen.findByText(
          'The preset in this toolset cannot be shown per connector here, so change it under the individual tools.',
        ),
      ).toBeInTheDocument();
      expect(access('kubernetes', 'Read-only')).toBeDisabled();
      expect(access('agent-manager', 'All')).toBeDisabled();
      // The individual tools stay open to change it, the preset listed as it is.
      expect(
        await screen.findByRole('heading', { name: 'Individual tools' }),
      ).toBeInTheDocument();
      expect(
        within(summaryBar()).getByTitle('preset:read-only'),
      ).toBeInTheDocument();
      expect(toolsetOutput()).toBe('preset:read-only | server:agent-manager');
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
