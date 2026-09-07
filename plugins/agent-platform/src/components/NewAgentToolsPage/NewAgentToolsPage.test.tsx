import { ReactNode, useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MCPServer,
  musterApiRef,
  TOOL_GROUP_LABEL,
  type FilterToolsOptions,
  type FilterToolsResponse,
  type MusterApi,
  type ToolSummary,
} from '@giantswarm/backstage-plugin-muster';
import { Agent } from '@giantswarm/backstage-plugin-kubernetes-react';

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

function agentWithToolset(name: string, toolset: string) {
  return new Agent(
    {
      apiVersion: 'kagent.dev/v1alpha2',
      kind: 'Agent',
      metadata: {
        name,
        namespace: 'kagent',
        annotations: { 'ui.giantswarm.io/display-name': 'Existing agent' },
      },
      spec: {
        type: 'Declarative',
        declarative: {
          modelConfig: 'opus',
          tools: [
            {
              type: 'McpServer',
              mcpServer: { name: 'muster', namespace: 'agent-platform' },
              headersFrom: [{ name: 'X-Muster-Toolset', value: toolset }],
            },
          ],
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
};

/**
 * A muster that resolves toolsets against the fixture the way the real one
 * would: presets by annotation, `server:` by the tool's server, `tool:` and
 * `workflow:` by name, within what the session can see. `pro`'s tool is
 * visible only after the sign-in.
 */
function makeMusterApi(scenario: Scenario) {
  const visible = () => (scenario.signedIn ? [...TOOLS, PRO_TOOL] : TOOLS);

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
 * The Toolset card, where the live resolution renders. Assertions on resolved
 * tool names are scoped to it: the same names sit in the catalogue's (collapsed)
 * tool cards, which `getByText` does not filter out.
 */
const toolsetCard = () =>
  screen.getByRole('heading', { name: 'Toolset' }).parentElement as HTMLElement;

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

  it('starts with nothing selected and blocks Continue until a choice is made; No tools is a choice', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });
    const user = userEvent.setup();

    expect(screen.getByText('Step 2 of 3: Tools')).toBeInTheDocument();
    expect(toolsetOutput()).toBe('');
    expect(continueButton()).toBeDisabled();
    expect(
      screen.getByText(/Choose a preset or compose a toolset to continue/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Preset No tools' }));

    expect(toolsetOutput()).toBe('preset:none');
    expect(continueButton()).toBeEnabled();
    expect(screen.getByText('No tools, as chosen.')).toBeInTheDocument();
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
        'Preset No tools',
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

  it('shows the resolved list for a preset, with read-only and destructive markers', async () => {
    const { api, filterTools } = makeMusterApi({
      signedIn: false,
      evaluatesToolsets: true,
    });
    await renderStep({ api });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('checkbox', { name: 'Preset Read-only tools' }),
    );

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

    // Expand the kubernetes family and pick the destructive tool.
    await user.click(
      screen.getByRole('button', { name: /kubernetes \(family\)/ }),
    );
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
    // The resolution card lists the destructive tool, marked.
    await waitFor(() =>
      expect(
        within(toolsetCard()).getByText('x_kubernetes_delete_pod'),
      ).toBeInTheDocument(),
    );
    expect(within(toolsetCard()).getByText('destructive')).toBeInTheDocument();
  });

  it('lists every registered server regardless of the viewer’s auth state, grouped by the label', async () => {
    const { api } = makeMusterApi({ signedIn: false, evaluatesToolsets: true });
    await renderStep({ api });

    await screen.findByRole('heading', { name: 'Infrastructure' });
    expect(
      screen.getByRole('heading', { name: 'Agent Platform' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Registered servers' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Workflows' }),
    ).toBeInTheDocument();

    // Infrastructure: the family, one row across its members.
    expect(
      screen.getByRole('button', { name: /^kubernetes \(family\) — 2 tools/ }),
    ).toBeInTheDocument();
    // Agent Platform: the labelled server, plus the warned core tools.
    expect(
      screen.getByRole('button', { name: /^agent-manager — 1 tool/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Platform administration' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('These tools manage the platform itself'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('checkbox', { name: 'Tool core_service_list' }),
    ).toBeInTheDocument();
    // Registered servers: the unlabelled one the viewer has not signed in to
    // is a row all the same.
    expect(
      screen.getByRole('button', { name: /^pro — sign in to see its tools/ }),
    ).toBeInTheDocument();
    // Workflows are their own group.
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

    await user.click(
      await screen.findByRole('button', {
        name: /^pro — sign in to see its tools/,
      }),
    );
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
    // becomes a selectable card.
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

    await user.click(
      await screen.findByRole('button', {
        name: /^pro — sign in to see its tools/,
      }),
    );
    await user.click(
      await screen.findByRole('checkbox', { name: 'Server pro' }),
    );

    expect(toolsetOutput()).toBe('server:pro');
    expect(continueButton()).toBeEnabled();
    // Flagged in the panel and in the toolset card.
    expect(
      screen.getAllByText(/Selected without a sign-in/).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByRole('button', {
        name: /^pro — sign in to see its tools · whole server selected/,
      }),
    ).toBeInTheDocument();
    // Nothing to pick: no tool cards for a server whose tools are not listed.
    expect(
      screen.queryByRole('checkbox', { name: /^Tool x_pro_/ }),
    ).not.toBeInTheDocument();
    // And muster reports the selector as matching nothing for this viewer.
    expect(
      await screen.findByText('Some selectors match nothing for you'),
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
    expect(screen.getByText(/unknown preset "foo"/)).toBeInTheDocument();
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

    // The unscoped answer is not presented as the resolution.
    expect(
      await screen.findByText(
        "This installation's muster does not evaluate toolsets yet",
      ),
    ).toBeInTheDocument();
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
    ).toEqual([
      'Preset Read-only tools',
      'Preset No tools',
      'Preset Full gateway',
    ]);
    expect(continueButton()).toBeDisabled();

    await user.click(
      screen.getByRole('checkbox', { name: 'Preset Full gateway' }),
    );

    expect(toolsetOutput()).toBe('preset:full');
    expect(screen.getAllByText('Full gateway access').length).toBeGreaterThan(
      0,
    );
    expect(continueButton()).toBeEnabled();
  });

  it('keeps none and full exclusive of everything else', async () => {
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

    await user.click(
      screen.getByRole('checkbox', { name: 'Workflow incident-triage' }),
    );
    expect(toolsetOutput()).toBe('workflow:incident-triage');

    await user.click(
      screen.getByRole('button', { name: 'Remove workflow:incident-triage' }),
    );
    expect(toolsetOutput()).toBe('');
    expect(continueButton()).toBeDisabled();
  });
});
