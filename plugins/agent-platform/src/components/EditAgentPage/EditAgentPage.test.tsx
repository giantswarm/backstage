import type { ReactNode } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  MCPServer,
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import { mockPhoneLayout } from '@giantswarm/backstage-plugin-ui-react/testUtils';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import type {
  AgentManagerAgent,
  AgentManagerInfo,
  AgentSkillEntry,
  AgentUpdate,
} from '../../lib/agentManager';
import { committedTo } from '../../lib/__fixtures__/gitOpsCommit';
import { agentsRouteRef } from '../../routes';
import { EditAgentPage } from './EditAgentPage';

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const OTHER = '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b';
const REPO = 'https://github.com/giantswarm/agent-skills';

jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({
    skills: [
      {
        name: 'PR review',
        description: 'Review pull requests.',
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        path: 'pr-review',
        ref: 'main',
        commit: '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b',
      },
      {
        name: 'Incident responder',
        description: 'Triage.',
        repoUrl: 'https://github.com/giantswarm/agent-skills',
        path: 'incident',
        ref: 'main',
        commit: '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b',
      },
    ],
    plugins: [],
    isLoading: false,
    error: null,
    hasRepositories: true,
    failedRepositories: [],
    truncated: false,
  }),
}));

/** The workspaces the person's Organizations have on the installation. */
const mockWorkspaceNames = jest.fn<string[], []>(() => []);
jest.mock('../../hooks/useSessionWorkspaces', () => ({
  ...jest.requireActual('../../hooks/useSessionWorkspaces'),
  useSessionWorkspaces: () => ({
    workspaces: mockWorkspaceNames().map(name => ({ name })),
    isLoading: false,
  }),
}));

// The model list as kagent reads it: two in the agent's namespace and one in
// another, which an edit cannot move the agent to.
function modelConfig(name: string, namespace: string, displayName: string) {
  return {
    getName: () => name,
    getNamespace: () => namespace,
    getDisplayName: () => displayName,
    getModel: () => `${name}-model`,
    getProvider: () => 'Anthropic',
  };
}
jest.mock('../ModelConfigsProvider', () => ({
  ModelConfigsProvider: ({ children }: { children: ReactNode }) => children,
  useModelConfigs: () => ({
    isLoading: false,
    unreachableInstallations: [],
    modelConfigsFor: () => [
      modelConfig('default-model-config', 'kagent', 'Claude Sonnet'),
      modelConfig('opus-4-7', 'kagent', 'Claude Opus'),
      modelConfig('elsewhere', 'other-team', 'Elsewhere'),
    ],
  }),
}));

// The Tools step has its own suite; here it only hands over to Review, through
// the wizard's own links.
jest.mock('../NewAgentToolsPage', () => ({
  NewAgentToolsPage: function MockToolsStep() {
    const { useNavigate } = jest.requireActual('react-router-dom');
    const { useAgentWizardLinks } = jest.requireActual('../AgentWizardFrame');
    const navigate = useNavigate();
    const { review } = useAgentWizardLinks();
    return (
      <button type="button" onClick={() => review && navigate(review())}>
        To review
      </button>
    );
  },
}));
jest.mock('../AgentAvatarPreview', () => ({ AgentAvatarPreview: () => null }));
// The skills step reads the fleet's agents for its Usage filter (T60); the
// filters have their own suite, so here no agent is known.
jest.mock('../AgentsDataProvider', () => ({
  ...jest.requireActual('../AgentsDataProvider'),
  AgentsDataProvider: ({ children }: { children: ReactNode }) => children,
  useAgents: () => ({ rows: [], isLoading: false }),
}));
jest.mock('../CreateAgentAssist', () => ({
  CreateAgentAssist: () => <p>create assist</p>,
}));
jest.mock('../../hooks/useToolsetResolution', () => ({
  useToolsetResolution: () => ({
    tools: [],
    unmatched: [],
    truncated: false,
    isLoading: false,
    status: 'resolved',
  }),
}));
/** The HelmRelease verbs the person may not use on the agent's release. */
let mockDeniedVerbs = new Set<string>();
/** The installation's MCPServer CRs; none unless a test says otherwise. */
let mockServerCrs: unknown[] = [];
/** Whether the MCPServer CRs are still being read. */
let mockServersLoading = false;
afterEach(() => {
  mockDeniedVerbs = new Set();
  mockServerCrs = [];
  mockServersLoading = false;
});
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (_clusters: string[], resourceClass: { kind?: string }) => ({
    resources: resourceClass?.kind === 'MCPServer' ? mockServerCrs : [],
    isLoading: resourceClass?.kind === 'MCPServer' && mockServersLoading,
    errors: [],
  }),
  useSelfSubjectAccessReview: (
    _cluster: string,
    attributes: { verb: string },
  ) => ({ allowed: !mockDeniedVerbs.has(attributes.verb), isLoading: false }),
}));
// The review fold-out's targeted ModelConfig read: what the agent's model runs.
jest.mock('../../hooks/useUnderlyingModel', () => ({
  ...jest.requireActual('../../hooks/useUnderlyingModel'),
  useUnderlyingModel: (
    _installation: string,
    name: string | undefined,
    namespace: string | undefined,
  ) => (name && namespace ? `${name}-model · Anthropic` : undefined),
}));
jest.mock('../CodeBlock', () => ({
  CodeBlock: ({
    content,
    filename,
  }: {
    content: string;
    filename?: string;
  }) => <pre data-testid={`code-${filename ?? 'command'}`}>{content}</pre>,
}));

const PR_REVIEW: AgentSkillEntry = {
  name: 'pr-review',
  path: 'pr-review',
  git: { url: REPO, commit: HEAD },
};
const OCI_SKILL: AgentSkillEntry = {
  name: 'runbooks',
  oci: 'gsoci.azurecr.io/giantswarm/skills/runbooks@sha256:0123456789abcdef',
};

const AGENT: AgentManagerAgent = {
  name: 'pr-reviewer',
  namespace: 'kagent',
  exists: true,
  displayName: 'PR reviewer',
  description: 'Reviews pull requests.',
  systemMessage: 'You review pull requests.',
  modelConfig: 'opus-4-7',
  harness: 'claude-code',
  skills: [PR_REVIEW, OCI_SKILL],
  toolset: ['preset:read-only'],
  ready: true,
  managed: 'helmrelease',
  values: { agent: { name: 'pr-reviewer' } },
};

const GITOPS_AGENT: AgentManagerAgent = { ...AGENT, managed: 'gitops' };

const INFO: Partial<AgentManagerInfo> = {
  capabilities: { create: true, validate: true, commit: false },
  harness: { name: 'kagent' },
};

const PULL_REQUEST = 'https://github.com/giantswarm/agents/pull/42';

type Scenario = {
  agent?: AgentManagerAgent;
  /** What `get_agent` fails with, as agent-manager answers a refused read. */
  getAgentError?: string;
  /** muster's session is not connected to agent-manager: every tool fails. */
  notConnected?: boolean;
  info?: Partial<AgentManagerInfo>;
  violations?: string[];
  /** What `/installations` reports for gazelle; true unless said otherwise. */
  requiresAuth?: boolean;
};

function makeMusterApi(scenario: Scenario = {}) {
  const agent = scenario.agent ?? AGENT;
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      if (scenario.notConnected) {
        throw new Error('server agent-manager not connected');
      }
      switch (name) {
        case 'x_agent-manager_get_info':
          return { ...INFO, ...scenario.info };
        case 'x_agent-manager_get_agent':
          if (scenario.getAgentError) {
            throw new Error(scenario.getAgentError);
          }
          return agent;
        case 'x_agent-manager_get_agent_status':
          return { agent: { generation: 3 } };
        case 'x_agent-manager_validate_agent':
          return {
            valid: !scenario.violations,
            mode: 'update',
            errors: scenario.violations,
            schemaVersion: '1.0.0',
            schemaSource: 'registry',
            manifests: {
              ociRepository: '',
              helmRelease: '',
              values: { agent: { description: args.description } },
            },
          };
        case 'x_agent-manager_update_agent':
          if (args.mode === 'commit') {
            return committedTo(PULL_REQUEST);
          }
          return {
            agent,
            before: {},
            after: {},
            changed: ['agent.description'],
            manifests: { ociRepository: '', helmRelease: '', values: {} },
            requestedBy: 'admin@lab.local',
          };
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  const listServers = jest.fn(async () => ({
    mcpServers: [{ name: 'agent-manager' }],
  }));
  const filterTools = jest.fn(async () => ({
    total: 0,
    filtered_count: 0,
    truncated: false,
    tools: [],
    presets: [],
  }));
  const listInstallations = jest.fn(async () => ({
    installations: [
      { name: 'gazelle', requiresAuth: scenario.requiresAuth ?? true },
    ],
  }));
  return {
    api: {
      callTool,
      listServers,
      filterTools,
      listInstallations,
    } as unknown as MusterApi,
    callTool,
  };
}

const BASE = '/customize/agents/gazelle/kagent/pr-reviewer/edit';

function DetailProbe() {
  const location = useLocation();
  const handoff = (location.state as Record<string, unknown> | null)?.[
    AGENT_CREATED_STATE_KEY
  ];
  return (
    <>
      <p>
        agent detail
        {handoff ? ` after ${(handoff as { action: string }).action}` : ''}
      </p>
      <Link to={BASE}>Edit again</Link>
    </>
  );
}

async function renderEdit(path: string, scenario: Scenario = {}) {
  const { api, callTool } = makeMusterApi(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <PageHeaderActionsProvider>
          <Routes>
            <Route
              path="/customize/agents/:installation/:namespace/:name/edit/*"
              element={<EditAgentPage />}
            />
            <Route
              path="/customize/agents/:installation/:namespace/:name"
              element={<DetailProbe />}
            />
          </Routes>
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    {
      initialRouteEntries: [path],
      mountedRoutes: { '/customize/agents': agentsRouteRef },
    },
  );
  return { callTool };
}

/** Changes what the agent is for, then walks Skills and Tools to Review. */
async function changeDescriptionAndReview(
  user: ReturnType<typeof userEvent.setup>,
) {
  const description = await screen.findByLabelText(/^What is it for\?/);
  await user.clear(description);
  await user.type(description, 'Reviews every pull request.');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('checkbox', { name: 'Skill PR review' });
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: 'To review' }));
  await screen.findByRole('heading', { name: 'Check and save' });
}

function callsOf(callTool: jest.Mock, tool: string) {
  return callTool.mock.calls.filter(([name]) => name === tool);
}

/** A connector muster signs in to per session, as `grafana-cloud` is. */
function grafanaCloud() {
  return new MCPServer(
    {
      apiVersion: 'muster.giantswarm.io/v1alpha1',
      kind: 'MCPServer',
      metadata: {
        name: 'grafana-cloud',
        namespace: 'muster',
        annotations: { 'ui.giantswarm.io/display-name': 'Grafana Cloud' },
      },
      spec: { type: 'streamable-http', auth: { type: 'oauth' } },
    } as never,
    'gazelle',
  );
}

describe('EditAgentPage', () => {
  it('opens the create wizard prefilled from the agent, its fixed parts shown, not offered', async () => {
    await renderEdit(BASE);

    // The wizard, once the agent is read; its frame says it is an edit.
    expect(await screen.findByLabelText(/^Name/)).toHaveValue('PR reviewer');
    expect(
      screen.getByRole('heading', { name: 'Edit agent' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Customize / Agents / PR reviewer'),
    ).toBeInTheDocument();
    // The document title names the agent, like the skill edit frames.
    await waitFor(() =>
      expect(document.title).toBe('Edit PR reviewer · Agents'),
    );
    expect(screen.getByLabelText(/^What is it for\?/)).toHaveValue(
      'Reviews pull requests.',
    );
    expect(screen.getByLabelText(/^Instructions/)).toHaveValue(
      'You review pull requests.',
    );
    // No Swarm Operator assist and no installation picker: it is an edit.
    expect(screen.queryByText('create assist')).not.toBeInTheDocument();

    // More options: the agent's model preselected, only its namespace's
    // models offered; its technical name and runtime fixed.
    expect(screen.getByText(/Runs on Claude Opus/)).toBeInTheDocument();
    // The line keeps the ModelConfig's name; the model it runs is behind an
    // info button beside it (PO decision L6), and on the picked card.
    const modelHint = screen.getByRole('button', {
      name: 'Which model Claude Opus runs',
    });
    // A bui tooltip opens on keyboard focus: a key press sets the modality.
    await userEvent.keyboard('{Shift}');
    act(() => modelHint.focus());
    expect(
      await screen.findByText('Underlying model: opus-4-7-model · Anthropic'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: 'Select model Claude Opus' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('radio', { name: 'Select model Claude Opus' }),
    ).toHaveTextContent('opus-4-7-model · Anthropic');
    expect(
      screen.queryByRole('radio', { name: 'Select model Elsewhere' }),
    ).not.toBeInTheDocument();
    // The locked technical name is shown under the name, stated once.
    expect(screen.queryByLabelText(/^Technical name/)).not.toBeInTheDocument();
    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.tagName === 'P' &&
          /^Its technical name is \S+; it cannot be changed\.$/.test(
            element.textContent ?? '',
          ),
        ),
      ),
    ).toBeInTheDocument();
    const runtime = screen.getByRole('list', { name: 'Runtime' });
    expect(runtime).toHaveTextContent('Harness claude-code');
    expect(within(runtime).queryByRole('radio')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "What runs the agent. Change it with Change Harness in the Agent actions menu on the agent's page.",
      ),
    ).toBeInTheDocument();
  });

  it('shows the skills step with the agent’s pins and the skills from elsewhere', async () => {
    await renderEdit(`${BASE}/skills`);

    const card = await screen.findByRole('checkbox', {
      name: 'Skill PR review',
    });
    expect(card).toHaveAttribute('aria-checked', 'true');
    // At its pin, with where the branch is now.
    expect(card).toHaveTextContent(
      `pinned at ${HEAD.slice(0, 7)} · main is at ${OTHER.slice(0, 7)}`,
    );
    expect(
      screen.getByRole('checkbox', { name: 'Skill Incident responder' }),
    ).toHaveAttribute('aria-checked', 'false');
    const kept = screen.getByRole('list', { name: 'Skills from elsewhere' });
    expect(within(kept).getByText('runbooks')).toBeInTheDocument();
  });

  it('reviews an untouched agent as no change, with Save changes locked', async () => {
    const { callTool } = await renderEdit(`${BASE}/review`);

    expect(await screen.findByText('Nothing changed yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(callsOf(callTool, 'x_agent-manager_validate_agent')).toHaveLength(0);
    // Reached without step 1: the fold-out still names the model the agent's
    // ModelConfig runs, beside the ModelConfig itself (PO decision L6).
    const underlying = screen.getByText('Underlying model').parentElement;
    expect(underlying).toHaveTextContent('opus-4-7-model · Anthropic');
  });

  it('summarises the review in words, the Harness and selectors only under Technical details', async () => {
    await renderEdit(`${BASE}/review`);
    await screen.findByText('Nothing changed yet.');
    const summary = screen.getByLabelText('Summary');
    const row = (label: string) =>
      within(summary).queryByText(label, { selector: 'dt' })
        ?.nextElementSibling;

    expect(row('Tools')).toHaveTextContent('Read-only tools');
    expect(summary).not.toHaveTextContent('preset:');
    // A Harness known by its name alone has no title: no raw name outside.
    expect(row('Runtime')).toBeUndefined();
    expect(summary).not.toHaveTextContent('claude-code');
    const harness = screen.getByText('Harness').parentElement;
    expect(harness).toHaveTextContent('claude-code');
    expect(harness?.closest('details')).not.toBeNull();
  });

  it('calls the platform Harness by the runtime field’s mark', async () => {
    await renderEdit(`${BASE}/review`, {
      agent: { ...AGENT, harness: 'kagent' },
    });
    await screen.findByText('Nothing changed yet.');

    expect(
      screen.getByText('Runtime', { selector: 'dt' }).nextElementSibling,
    ).toHaveTextContent('Platform default');
  });

  it('saves only what changed through update_agent and hands over to the agent’s page', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderEdit(BASE);

    await changeDescriptionAndReview(user);

    const changes = await screen.findByRole('list', { name: 'Changed fields' });
    expect(within(changes).getAllByRole('listitem')).toHaveLength(1);
    expect(within(changes).getByText("What it's for")).toBeInTheDocument();
    // The dry run of exactly that change, in mode apply.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeEnabled(),
    );
    const [, dryRunArgs] = callsOf(
      callTool,
      'x_agent-manager_validate_agent',
    )[0];
    expect(dryRunArgs).toMatchObject({
      namespace: 'kagent',
      name: 'pr-reviewer',
      description: 'Reviews every pull request.',
    });
    expect(dryRunArgs).not.toHaveProperty('skills');
    expect(dryRunArgs).not.toHaveProperty('toolset');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(
      await screen.findByText('agent detail after updated'),
    ).toBeInTheDocument();
    const [, written] = callsOf(callTool, 'x_agent-manager_update_agent')[0];
    expect(written).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      description: 'Reviews every pull request.',
    } satisfies AgentUpdate);
  });

  it('gives an agent whose connector needs a sign-in the tool to start it, shown in the review', async () => {
    mockServerCrs = [grafanaCloud()];
    const user = userEvent.setup();
    const { callTool } = await renderEdit(BASE, {
      agent: { ...AGENT, toolset: ['server:grafana-cloud'] },
    });

    await changeDescriptionAndReview(user);

    const changes = await screen.findByRole('list', { name: 'Changed fields' });
    expect(within(changes).getAllByRole('listitem')).toHaveLength(2);
    const tools = within(changes).getByText('Tools').closest('li');
    expect(tools).toHaveTextContent(
      'Adds core_auth_login, which lets the agent start the sign-in to Grafana Cloud.',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeEnabled(),
    );
    const [, dryRunArgs] = callsOf(
      callTool,
      'x_agent-manager_validate_agent',
    ).at(-1)!;
    expect(dryRunArgs).toMatchObject({
      toolset: ['server:grafana-cloud', 'tool:core_auth_login'],
    });

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(
      await screen.findByText('agent detail after updated'),
    ).toBeInTheDocument();
    const [, written] = callsOf(callTool, 'x_agent-manager_update_agent')[0];
    expect(written).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      description: 'Reviews every pull request.',
      toolset: ['server:grafana-cloud', 'tool:core_auth_login'],
    } satisfies AgentUpdate);
  });

  it('reviews an agent that already has the sign-in tool its connector needs as no change', async () => {
    mockServerCrs = [grafanaCloud()];
    await renderEdit(`${BASE}/review`, {
      agent: {
        ...AGENT,
        // Saved anywhere in the list, as another client may have put it.
        toolset: ['tool:core_auth_login', 'server:grafana-cloud'],
      },
    });

    expect(await screen.findByText('Nothing changed yet.')).toBeInTheDocument();
  });

  it('takes the sign-in tool away once no connector of the agent needs it', async () => {
    mockServerCrs = [grafanaCloud()];
    const { callTool } = await renderEdit(`${BASE}/review`, {
      agent: {
        ...AGENT,
        toolset: ['tool:x_docs_search', 'tool:core_auth_login'],
      },
    });

    const changes = await screen.findByRole('list', { name: 'Changed fields' });
    expect(within(changes).getByText('Tools').closest('li')).toHaveTextContent(
      'Removes core_auth_login: no connector in the toolset needs it any more.',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Save changes' }),
      ).toBeEnabled(),
    );
    const [, dryRunArgs] = callsOf(
      callTool,
      'x_agent-manager_validate_agent',
    ).at(-1)!;
    expect(dryRunArgs).toMatchObject({ toolset: ['tool:x_docs_search'] });
  });

  it('holds Save while it is still read whether a connector needs the sign-in tool', async () => {
    mockServerCrs = [grafanaCloud()];
    mockServersLoading = true;
    const user = userEvent.setup();
    const { callTool } = await renderEdit(BASE, {
      agent: { ...AGENT, toolset: ['server:grafana-cloud'] },
    });

    await changeDescriptionAndReview(user);

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(callsOf(callTool, 'x_agent-manager_validate_agent')).toHaveLength(0);
  });

  it('opens an agent whose connector needs a sign-in without counting the added tool as the person’s change', async () => {
    mockServerCrs = [grafanaCloud()];
    const user = userEvent.setup();
    await renderEdit(BASE, {
      agent: { ...AGENT, toolset: ['server:grafana-cloud'] },
    });

    await screen.findByLabelText(/^What is it for\?/);
    await user.click(screen.getByRole('link', { name: 'Cancel' }));

    expect(await screen.findByText('agent detail')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('the default workspace', () => {
    afterEach(() => mockWorkspaceNames.mockReturnValue([]));

    async function pickDefault(
      user: ReturnType<typeof userEvent.setup>,
      option: RegExp,
    ) {
      await screen.findByLabelText(/^What is it for\?/);
      await user.click(screen.getByText('More options'));
      await user.click(
        await screen.findByRole('button', { name: /Default workspace/ }),
      );
      await user.click(await screen.findByRole('option', { name: option }));
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await screen.findByRole('checkbox', { name: 'Skill PR review' });
      await user.click(screen.getByRole('button', { name: 'Continue' }));
      await user.click(
        await screen.findByRole('button', { name: 'To review' }),
      );
      await screen.findByRole('heading', { name: 'Check and save' });
    }

    it('sets one of the environment’s workspaces, in the agent’s namespace', async () => {
      mockWorkspaceNames.mockReturnValue(['platform-mcp', 'platform-mix']);
      const user = userEvent.setup();
      const { callTool } = await renderEdit(BASE, {
        info: { ...INFO, capabilities: { defaultWorkspace: true } },
      });

      await pickDefault(user, /^platform-mix$/);

      const changes = await screen.findByRole('list', {
        name: 'Changed fields',
      });
      expect(
        within(changes).getByText('Default workspace'),
      ).toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Save changes' }),
        ).toBeEnabled(),
      );
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByText('agent detail after updated');
      const [, written] = callsOf(callTool, 'x_agent-manager_update_agent')[0];
      expect(written).toEqual({
        namespace: 'kagent',
        name: 'pr-reviewer',
        defaultWorkspace: 'kagent/platform-mix',
      } satisfies AgentUpdate);
    });

    it('removes the default, offered even when it is no longer listed', async () => {
      mockWorkspaceNames.mockReturnValue(['platform-mcp']);
      const user = userEvent.setup();
      const { callTool } = await renderEdit(BASE, {
        agent: { ...AGENT, defaultWorkspace: 'kagent/gone' },
        info: { ...INFO, capabilities: { defaultWorkspace: true } },
      });

      await screen.findByLabelText(/^What is it for\?/);
      expect(
        screen.getByText('More options').closest('summary'),
      ).toHaveTextContent(/default workspace gone/);
      await pickDefault(user, /^No default workspace$/);

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Save changes' }),
        ).toBeEnabled(),
      );
      await user.click(screen.getByRole('button', { name: 'Save changes' }));
      await screen.findByText('agent detail after updated');
      const [, written] = callsOf(callTool, 'x_agent-manager_update_agent')[0];
      expect(written).toEqual({
        namespace: 'kagent',
        name: 'pr-reviewer',
        defaultWorkspace: '',
      } satisfies AgentUpdate);
    });

    it('is not offered where agent-manager does not start sessions in a default', async () => {
      mockWorkspaceNames.mockReturnValue(['platform-mcp']);
      await renderEdit(BASE);
      await screen.findByLabelText(/^What is it for\?/);
      expect(
        screen.queryByRole('button', { name: /Default workspace/ }),
      ).not.toBeInTheDocument();
    });
  });

  it('leaves an untouched edit without asking', async () => {
    const user = userEvent.setup();
    await renderEdit(BASE);

    await screen.findByLabelText(/^What is it for\?/);
    await user.click(screen.getByRole('link', { name: 'Cancel' }));

    expect(await screen.findByText('agent detail')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks before Close or Cancel discards a change, on any step', async () => {
    const user = userEvent.setup();
    await renderEdit(BASE);

    await changeDescriptionAndReview(user);
    await user.click(screen.getByRole('link', { name: 'Close' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Discard your changes?');
    await user.click(
      within(dialog).getByRole('button', { name: 'Keep editing' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Check and save' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    expect(await screen.findByText('agent detail')).toBeInTheDocument();
  });

  it('reopens on the saved values, not a cached pre-save reading', async () => {
    // Live round 2 (R2): opening the wizard straight after a save prefilled the
    // pre-save description, and a second save would have diffed against it.
    // agent-manager's read can lag its own write for a moment, so the reading
    // taken as the save lands may still be the old one; the reopened wizard
    // must read the agent again rather than seed from that.
    const user = userEvent.setup();
    const { callTool } = await renderEdit(BASE);
    let current = AGENT;
    let lagging = false;
    const scripted = callTool.getMockImplementation()!;
    callTool.mockImplementation(async (name, args) => {
      if (name === 'x_agent-manager_update_agent') {
        lagging = true;
        current = { ...AGENT, description: args.description as string };
      }
      if (name === 'x_agent-manager_get_agent') {
        if (lagging) {
          lagging = false;
          return AGENT;
        }
        return current;
      }
      return scripted(name, args);
    });

    await changeDescriptionAndReview(user);
    const save = screen.getByRole('button', { name: 'Save changes' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await screen.findByText('agent detail after updated');

    await user.click(screen.getByRole('link', { name: 'Edit again' }));

    await waitFor(() =>
      expect(screen.getByLabelText(/^What is it for\?/)).toHaveValue(
        'Reviews every pull request.',
      ),
    );
    // And the next save diffs against the saved values: nothing changed yet.
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('checkbox', { name: 'Skill PR review' });
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(await screen.findByRole('button', { name: 'To review' }));
    expect(await screen.findByText('Nothing changed yet.')).toBeInTheDocument();
  });

  it('shows agent-manager’s refusal and keeps Save changes locked', async () => {
    const user = userEvent.setup();
    await renderEdit(BASE, { violations: ['agent.description: too long'] });

    await changeDescriptionAndReview(user);

    expect(
      await screen.findByText('This change cannot be saved'),
    ).toBeInTheDocument();
    expect(screen.getByText('agent.description: too long')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('proposes the change as a pull request for an agent applied from git', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderEdit(BASE, {
      agent: GITOPS_AGENT,
      info: { ...INFO, capabilities: { commit: true } },
    });

    await changeDescriptionAndReview(user);
    const propose = await screen.findByRole('button', {
      name: 'Propose changes as pull request',
    });
    await waitFor(() => expect(propose).toBeEnabled());
    await user.click(propose);

    expect(
      await screen.findByRole('button', { name: 'Proposed' }),
    ).toBeDisabled();
    const [, written] = callsOf(callTool, 'x_agent-manager_update_agent')[0];
    expect(written).toMatchObject({
      mode: 'commit',
      description: 'Reviews every pull request.',
    });
  });

  it('keeps the pull-request footer to one row at phone width', async () => {
    const layout = mockPhoneLayout();
    try {
      const user = userEvent.setup();
      await renderEdit(BASE, {
        agent: GITOPS_AGENT,
        info: { ...INFO, capabilities: { commit: true } },
      });

      // The title over its context, the step strip one line.
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Edit agent' }),
      ).toBeInTheDocument();
      expect(
        await screen.findByText(/^Step 1 of \d · Details$/),
      ).toBeInTheDocument();

      await changeDescriptionAndReview(user);
      const footer = screen.getByRole('contentinfo');
      const propose = await within(footer).findByRole('button', {
        name: 'Propose as pull request',
      });
      expect(
        within(footer).getByRole('button', { name: 'Back' }),
      ).not.toHaveTextContent('Back');
      await waitFor(() => expect(propose).toBeEnabled());
    } finally {
      layout.restore();
    }
  });

  it('has no form for an agent applied from git without the commit capability', async () => {
    await renderEdit(BASE, { agent: GITOPS_AGENT });

    expect(
      await screen.findByText('This agent cannot be edited from here'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('has no form for a person who may not update the agent’s release, and says whose role may', async () => {
    mockDeniedVerbs = new Set(['update']);
    await renderEdit(BASE);

    expect(
      await screen.findByText('You cannot change this agent'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/needs the agent-platform:editor role/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
  });

  it('refuses a person who may not update the agent’s release, rather than reporting the read their role does not allow', async () => {
    // agent-platform:user may not get HelmReleases, so agent-manager's
    // get_agent fails as them before the page knows the agent.
    mockDeniedVerbs = new Set(['update']);
    await renderEdit(BASE, {
      getAgentError:
        'get helmrelease kagent/pr-reviewer: helmreleases.helm.toolkit.fluxcd.io "pr-reviewer" is forbidden: User "oidc:alice@lab.local" cannot get resource "helmreleases"',
    });

    expect(
      await screen.findByText('You cannot change this agent'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Changing the agents of the platform needs the agent-platform:editor role/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('agent-manager could not read this agent'),
    ).not.toBeInTheDocument();
  });

  it('asks to connect to agent-manager first where muster is not connected, whatever the access review says', async () => {
    mockDeniedVerbs = new Set(['update']);
    await renderEdit(BASE, { notConnected: true });

    expect(
      await screen.findByText(/server agent-manager not connected/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('You cannot change this agent'),
    ).not.toBeInTheDocument();
  });

  it('has no form, and says why, where muster runs under its shared identity', async () => {
    const { callTool } = await renderEdit(BASE, { requiresAuth: false });

    expect(
      await screen.findByText('This agent cannot be edited from here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /muster on gazelle has no per-user sign-in in this portal/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    // Nothing is asked of agent-manager: muster-backend would refuse it.
    expect(callTool).not.toHaveBeenCalled();
  });
});
