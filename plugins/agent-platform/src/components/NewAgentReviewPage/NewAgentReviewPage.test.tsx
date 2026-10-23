import { ReactNode, useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
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
  AgentManagerInfo,
  AgentSpec,
  ValidateAgentResult,
} from '../../lib/agentManager';
import type { HarnessChoice } from '../../lib/harnesses';
import type { DiscoveredSkill } from '../../lib/skills';
import { agentsRouteRef } from '../../routes';
import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { NewAgentReviewPage } from './NewAgentReviewPage';
import { committedTo } from '../../lib/__fixtures__/gitOpsCommit';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => ({
    skills: [],
    isLoading: false,
    error: null,
    hasRepositories: true,
    failedRepositories: [],
    truncated: false,
  }),
}));

// The MCPServer CRs the toolset section groups by list nothing, unless a
// test says otherwise.
let mockServerCrs: unknown[] = [];
/** Whether the MCPServer CRs are still being read. */
let mockServersLoading = false;
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (_clusters: string[], resourceClass: { kind?: string }) => ({
    resources: resourceClass?.kind === 'MCPServer' ? mockServerCrs : [],
    isLoading: resourceClass?.kind === 'MCPServer' && mockServersLoading,
    errors: [],
  }),
}));

// The targeted ModelConfig read behind the fold-out's "Underlying model";
// unread (undefined) unless a test says what the ModelConfig runs.
const mockUseUnderlyingModel = jest.fn();
jest.mock('../../hooks/useUnderlyingModel', () => ({
  ...jest.requireActual('../../hooks/useUnderlyingModel'),
  useUnderlyingModel: (...args: unknown[]) => mockUseUnderlyingModel(...args),
}));

jest.mock('../../hooks/useAgentIconUrl', () => ({
  useAgentIconUrl: () => (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/${name}.png`,
}));

// CodeMirror does not lay out in jsdom; a plain block exposes the YAML the
// page hands it, which is what the assertions read.
jest.mock('../CodeBlock', () => ({
  CodeBlock: ({
    content,
    filename,
  }: {
    content: string;
    filename?: string;
  }) => <pre data-testid={`code-${filename ?? 'command'}`}>{content}</pre>,
}));

const HEAD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';

const SKILL: DiscoveredSkill = {
  name: 'Incident responder',
  description: 'Triage.',
  repoUrl: 'https://github.com/giantswarm/agent-skills',
  path: 'incident',
  ref: 'main',
  commit: HEAD,
};

const INFO: AgentManagerInfo = {
  version: '1.0.0',
  chart: {
    ociUrl: 'oci://gsoci.azurecr.io/charts/giantswarm/agent',
    semver: '1.x',
    latestVersion: '1.0.0',
    schemaVersion: '1.0.0',
    schemaSource: 'registry',
  },
  namespaces: { default: 'kagent', managed: ['kagent'] },
  capabilities: { create: true, validate: true, commit: false },
  identity: 'caller',
  apiVersions: {
    agent: 'api.kagent.dev/v1alpha3',
    agentTemplate: 'api.kagent.dev/v1alpha3',
    harness: 'api.kagent.dev/v1alpha3',
    remoteMcpServer: 'api.kagent.dev/v1alpha3',
    modelConfig: 'api.kagent.dev/v1alpha3',
    helmRelease: 'helm.toolkit.fluxcd.io/v2',
    ociRepository: 'source.toolkit.fluxcd.io/v1',
  },
  flux: {
    helmReleaseInterval: '10m',
    ociRepositoryInterval: '30m',
    serviceAccountName: 'kagent-flux',
  },
  harness: { name: 'kagent' },
  muster: { url: '' },
  skillsRepositories: ['https://github.com/giantswarm/agent-skills'],
};

/** What agent-manager's dry run of `spec` renders — fixture, not composition. */
function dryRunOf(spec: AgentSpec): ValidateAgentResult {
  const values = {
    agent: {
      name: spec.name,
      displayName: spec.displayName,
      harness: 'kagent',
      ...(spec.systemMessage ? { systemMessage: spec.systemMessage } : {}),
    },
    modelConfig: { name: spec.modelConfig },
    toolset: spec.toolset,
    ...(spec.skills ? { skills: spec.skills } : {}),
  };
  return {
    valid: true,
    mode: 'create',
    schemaVersion: '1.0.0',
    schemaSource: 'registry',
    manifests: {
      ociRepository: [
        'apiVersion: source.toolkit.fluxcd.io/v1',
        'kind: OCIRepository',
        `metadata:\n  name: agent\n  namespace: ${spec.namespace}`,
        'spec:\n  url: oci://gsoci.azurecr.io/charts/giantswarm/agent\n  ref:\n    semver: 1.x\n',
      ].join('\n'),
      helmRelease: [
        'apiVersion: helm.toolkit.fluxcd.io/v2',
        'kind: HelmRelease',
        `metadata:\n  name: ${spec.name}\n  namespace: ${spec.namespace}`,
        `spec:\n  serviceAccountName: kagent-flux\n  values:\n    skills:\n      - git:\n          commit: ${
          spec.skills && 'git' in spec.skills[0]
            ? spec.skills[0].git.commit
            : ''
        }\n`,
      ].join('\n'),
      values,
    },
  };
}

type Scenario = {
  /** Extra egress origins typed on the first step, one per line. */
  egressText?: string;
  info?: Partial<AgentManagerInfo>;
  /** Violations the dry run reports instead of a clean result. */
  violations?: string[];
  /** Checks a clean dry run could not make. */
  notes?: string[];
  /** What create_agent does: succeed, or throw this error. */
  createError?: Error;
  /** The dry run itself is refused (thrown), e.g. a not-connected session. */
  validateError?: Error;
  /** The Harness picked on the details step; none is the platform Harness. */
  harness?: HarnessChoice;
  /** The toolset picked on the Tools step; `preset:read-only` by default. */
  toolset?: string[];
};

function makeMusterApi(scenario: Scenario = {}) {
  const info = { ...INFO, ...scenario.info };
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      switch (name) {
        case 'x_agent-manager_get_info':
          return info;
        case 'x_agent-manager_validate_agent': {
          if (scenario.validateError) {
            throw scenario.validateError;
          }
          const result = dryRunOf(args as AgentSpec);
          if (scenario.violations) {
            return { ...result, valid: false, errors: scenario.violations };
          }
          return scenario.notes ? { ...result, notes: scenario.notes } : result;
        }
        case 'x_agent-manager_create_agent': {
          if (scenario.createError) {
            throw scenario.createError;
          }
          const spec = args as AgentSpec;
          return {
            agent: { name: spec.name, namespace: spec.namespace },
            manifests: dryRunOf(spec).manifests,
            created: { ociRepository: true, helmRelease: true },
            requestedBy: 'admin@lab.local',
            ...(args.mode === 'commit'
              ? committedTo('https://github.com/org/gitops/pull/7')
              : {}),
          };
        }
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  const filterTools = jest.fn(async () => ({
    total: 0,
    filtered_count: 0,
    truncated: false,
    tools: [],
    toolset: ['preset:read-only'],
    toolset_unmatched: [],
  }));
  const listTools = jest.fn(async () => ({
    tools: [],
    servers_requiring_auth: [],
  }));
  const getAuthStatus = jest.fn(async () => ({ servers: [] }));
  const signInServer = jest.fn(async () => ({
    status: 'connected' as const,
    message: 'Already connected.',
  }));
  return {
    api: {
      callTool,
      filterTools,
      listTools,
      getAuthStatus,
      signInServer,
    } as unknown as MusterApi,
    callTool,
  };
}

/** Fills the whole form the way the three earlier steps would. */
function Seed({
  children,
  withSkill = true,
  harness,
  egressText,
  toolset = ['preset:read-only'],
}: {
  children: ReactNode;
  withSkill?: boolean;
  harness?: HarnessChoice;
  egressText?: string;
  toolset?: string[];
}) {
  const {
    setName,
    setDescription,
    setSystemMessage,
    setEgressText,
    setInstallation,
    selectModelConfig,
    selectHarness,
    toggleSkill,
    setToolset,
    isComplete,
  } = useNewAgentForm();
  useEffect(() => {
    setName('Go service reviewer');
    setDescription('Reviews pull requests.');
    setSystemMessage('You review pull requests.');
    if (egressText) {
      setEgressText(egressText);
    }
    setInstallation('gazelle');
    selectModelConfig('opus-4-7', 'kagent');
    selectHarness(harness);
    if (withSkill) {
      toggleSkill(SKILL);
    }
    setToolset(toolset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return isComplete ? <>{children}</> : null;
}

async function renderReview(
  scenario: Scenario = {},
  withSkill = true,
  persistDraft = false,
) {
  const { api, callTool } = makeMusterApi(scenario);
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        {/* The step's actions land in the wizard frame's footer through the
            page-header slot, which is what is driven. */}
        <PageHeaderActionsProvider>
          <NewAgentFormProvider persistDraft={persistDraft}>
            <Seed
              withSkill={withSkill}
              harness={scenario.harness}
              egressText={scenario.egressText}
              toolset={scenario.toolset}
            >
              <NewAgentReviewPage />
            </Seed>
          </NewAgentFormProvider>
        </PageHeaderActionsProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/customize/agents': agentsRouteRef } },
  );
  return { callTool };
}

/** The drafts kept in the tab (its other entries are not the form's). */
const draftCount = () =>
  Object.keys(window.sessionStorage).filter(key => key.startsWith('gs-draft:'))
    .length;

const deployButton = () =>
  screen.getByRole('button', { name: /^(Create agent|Creating…)$/ });

/** The plain summary's answer for `label`. */
const plainRow = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement;

function specSentTo(callTool: jest.Mock, tool: string): AgentSpec {
  const call = callTool.mock.calls.find(([name]) => name === tool);
  expect(call).toBeDefined();
  return call![1] as AgentSpec;
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockUseUnderlyingModel.mockReset();
  mockServerCrs = [];
  mockServersLoading = false;
  window.sessionStorage.clear();
});

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

describe('NewAgentReviewPage', () => {
  it('leads with the plain summary and keeps the manifests under Technical details', async () => {
    await renderReview();

    expect(
      screen.getByRole('heading', { name: 'Check and create' }),
    ).toBeInTheDocument();
    expect(plainRow('Name')).toHaveTextContent('Go service reviewer');
    expect(plainRow("What it's for")).toHaveTextContent(
      'Reviews pull requests.',
    );
    // No display name was handed over, so the ModelConfig's name stands in.
    expect(plainRow('Model')).toHaveTextContent('opus-4-7');
    expect(plainRow('Runtime')).toHaveTextContent(
      'Standard (platform default)',
    );
    expect(plainRow('Skills')).toHaveTextContent('Incident responder');
    expect(plainRow('Tools')).toHaveTextContent('Read-only tools');

    // The release and its manifests sit in a collapsed disclosure.
    const release = await screen.findByTestId('code-go-service-reviewer.yaml');
    const technical = release.closest('details') as HTMLDetailsElement;
    expect(technical).not.toBeNull();
    expect(technical.open).toBe(false);
    expect(
      within(technical).getByText('Technical details'),
    ).toBeInTheDocument();
    await waitFor(() => expect(deployButton()).toBeEnabled());
    // Nothing read about the ModelConfig: no underlying-model line.
    expect(within(technical).queryByText('Underlying model')).toBeNull();
  });

  it('keeps the ModelConfig name and names the model it runs under Technical details', async () => {
    mockUseUnderlyingModel.mockReturnValue('claude-sonnet-4-6 · Anthropic');

    await renderReview();

    // The plain summary keeps the ModelConfig's name (PO decision L6).
    expect(plainRow('Model')).toHaveTextContent('opus-4-7');
    expect(plainRow('Model')).not.toHaveTextContent('claude-sonnet-4-6');
    // The model is one disclosure away, beside the ModelConfig it belongs to.
    const release = await screen.findByTestId('code-go-service-reviewer.yaml');
    const technical = release.closest('details') as HTMLDetailsElement;
    const item = within(technical).getByText('Underlying model').parentElement;
    expect(item).toHaveTextContent('claude-sonnet-4-6 · Anthropic');
    expect(mockUseUnderlyingModel).toHaveBeenCalledWith(
      'gazelle',
      'opus-4-7',
      'kagent',
    );
  });

  it('sends the extra egress origins and names them in the summary', async () => {
    const { callTool } = await renderReview({
      egressText: 'https://github.com:443\nhttps://*.githubusercontent.com',
    });
    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_agent-manager_validate_agent',
        expect.anything(),
        'gazelle',
      ),
    );
    expect(
      specSentTo(callTool, 'x_agent-manager_validate_agent').egress,
    ).toEqual(['https://github.com:443', 'https://*.githubusercontent.com']);
    expect(screen.getByText('Extra egress')).toBeInTheDocument();
    expect(
      screen.getByText(
        'https://github.com:443, https://*.githubusercontent.com',
      ),
    ).toBeInTheDocument();
  });

  it('creates an agent with a connector that needs a sign-in able to start it', async () => {
    mockServerCrs = [grafanaCloud()];
    const user = userEvent.setup();
    const { callTool } = await renderReview({
      toolset: ['server:grafana-cloud', 'tool:x_docs_search'],
    });

    expect(plainRow('Tools')).toHaveTextContent(
      'Adds core_auth_login, which lets the agent start the sign-in to Grafana Cloud.',
    );
    await waitFor(() => expect(deployButton()).toBeEnabled());
    expect(
      specSentTo(callTool, 'x_agent-manager_validate_agent').toolset,
    ).toEqual([
      'server:grafana-cloud',
      'tool:x_docs_search',
      'tool:core_auth_login',
    ]);

    await user.click(deployButton());
    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_agent-manager_create_agent',
        expect.anything(),
        'gazelle',
      ),
    );
    expect(
      specSentTo(callTool, 'x_agent-manager_create_agent').toolset,
    ).toEqual([
      'server:grafana-cloud',
      'tool:x_docs_search',
      'tool:core_auth_login',
    ]);
  });

  it('holds Create while it is still read whether a connector needs the sign-in tool', async () => {
    mockServerCrs = [grafanaCloud()];
    mockServersLoading = true;
    const { callTool } = await renderReview({
      toolset: ['server:grafana-cloud'],
    });

    expect(deployButton()).toBeDisabled();
    expect(
      callTool.mock.calls.filter(
        ([name]) => name === 'x_agent-manager_validate_agent',
      ),
    ).toHaveLength(0);
  });

  it("renders agent-manager's dry run: the 1.x OCIRepository, the HelmRelease with the pinned skill, the chart and the Harness", async () => {
    const { callTool } = await renderReview();

    // The dry run is agent-manager's, from the form as its contract.
    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_agent-manager_validate_agent',
        expect.anything(),
        'gazelle',
      ),
    );
    const spec = specSentTo(callTool, 'x_agent-manager_validate_agent');
    expect(spec).toEqual({
      namespace: 'kagent',
      name: 'go-service-reviewer',
      displayName: 'Go service reviewer',
      description: 'Reviews pull requests.',
      systemMessage: 'You review pull requests.',
      modelConfig: 'opus-4-7',
      iconUrl: 'https://avatars.gazelle.example/v1/go-service-reviewer.png',
      skills: [
        {
          name: 'Incident responder',
          path: 'incident',
          git: {
            url: 'https://github.com/giantswarm/agent-skills',
            commit: HEAD,
          },
        },
      ],
      toolset: ['preset:read-only'],
    });
    expect(spec).not.toHaveProperty('runtime');
    expect(spec).not.toHaveProperty('harness');
    expect(spec).not.toHaveProperty('egress');

    // What agent-manager rendered is what is shown, verbatim.
    const oci = await screen.findByTestId('code-agent.yaml');
    expect(oci).toHaveTextContent('kind: OCIRepository');
    expect(oci).toHaveTextContent('semver: 1.x');
    const release = screen.getByTestId('code-go-service-reviewer.yaml');
    expect(release).toHaveTextContent('kind: HelmRelease');
    expect(release).toHaveTextContent(`commit: ${HEAD}`);

    // The chart and the Harness come from get_info, not from the portal.
    expect(
      screen.getByText('oci://gsoci.azurecr.io/charts/giantswarm/agent:1.x'),
    ).toBeInTheDocument();
    expect(screen.getByText('latest 1.0.0')).toBeInTheDocument();
    expect(screen.getByText('Harness').parentElement).toHaveTextContent(
      'kagent',
    );
    // The technical summary names the skill's pin and the selectors.
    expect(screen.getByText('cb1fb76').parentElement).toHaveTextContent(
      /^@cb1fb76$/,
    );
    expect(screen.getByText('Toolset').parentElement).toHaveTextContent(
      'preset:read-only',
    );
    // Validated against the chart schema agent-manager named.
    expect(
      screen.getByText(/Values validated against the chart's schema/),
    ).toHaveTextContent('1.0.0 (registry)');
  });

  it('shows no limits for a Claude Code Harness', async () => {
    await renderReview({ harness: { name: 'claude', runtime: 'claude' } });

    await screen.findByText('Claude Code');
    expect(screen.queryByRole('group', { name: 'Limits' })).toBeNull();
    expect(screen.queryByText(/per turn/)).toBeNull();
  });

  it('validates and creates on the Harness picked, and names it in the review', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderReview({
      harness: {
        name: 'claude',
        runtime: 'claude',
        imageName: 'claude-harness',
      },
    });

    await waitFor(() =>
      expect(
        specSentTo(callTool, 'x_agent-manager_validate_agent'),
      ).toMatchObject({ harness: 'claude' }),
    );
    // The plain summary names the runtime, the technical one the Harness.
    expect(plainRow('Runtime')).toHaveTextContent('Claude Code');
    expect(screen.getByText('Harness').parentElement).toHaveTextContent(
      'claude',
    );
    expect(
      screen.getByText(/the agent runs on the Harness/),
    ).toBeInTheDocument();

    await screen.findByTestId('code-agent.yaml');
    await waitFor(() => expect(deployButton()).toBeEnabled());
    await user.click(deployButton());
    await waitFor(() =>
      expect(
        specSentTo(callTool, 'x_agent-manager_create_agent'),
      ).toMatchObject({ harness: 'claude' }),
    );
  });

  it("shows the dry run's violations inline and withholds Deploy", async () => {
    await renderReview({
      violations: [
        'modelConfig "opus-4-7" not found in namespace kagent; valid: default-model-config',
        'skills[0].git.commit: must be a full commit id',
      ],
    });

    const list = await screen.findByRole('list', { name: 'Violations' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).toHaveTextContent('valid: default-model-config');
    expect(
      screen.getByText('agent-manager refuses this configuration'),
    ).toBeInTheDocument();
    expect(deployButton()).toBeDisabled();
  });

  it("shows the dry run's notes beside a valid result and keeps Deploy", async () => {
    await renderReview({
      notes: [
        'the name "go-service-reviewer" could not be checked for a clash: forbidden',
      ],
    });

    const list = await screen.findByRole('list', { name: 'Notes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(list).toHaveTextContent('could not be checked for a clash');
    expect(
      screen.queryByRole('list', { name: 'Violations' }),
    ).not.toBeInTheDocument();
    expect(deployButton()).toBeEnabled();
  });

  it('shows no notes when the dry run reports none', async () => {
    await renderReview();

    await screen.findByTestId('code-agent.yaml');
    expect(
      screen.queryByRole('list', { name: 'Notes' }),
    ).not.toBeInTheDocument();
    expect(deployButton()).toBeEnabled();
  });

  it('deploys through create_agent as given and lands on the detail page with the create handed over', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderReview();

    await screen.findByTestId('code-agent.yaml');
    await waitFor(() => expect(deployButton()).toBeEnabled());
    await user.click(deployButton());

    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_agent-manager_create_agent',
        expect.anything(),
        'gazelle',
      ),
    );
    const created = specSentTo(callTool, 'x_agent-manager_create_agent');
    expect(created).toEqual(
      specSentTo(callTool, 'x_agent-manager_validate_agent'),
    );
    expect(created).not.toHaveProperty('mode');
    expect(created).not.toHaveProperty('force');

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/customize/agents/gazelle/kagent/go-service-reviewer',
        {
          state: {
            [AGENT_CREATED_STATE_KEY]: {
              installation: 'gazelle',
              namespace: 'kagent',
              name: 'go-service-reviewer',
              requestedBy: 'admin@lab.local',
            },
          },
        },
      ),
    );
  });

  it('drops the kept draft once the agent is created', async () => {
    const user = userEvent.setup();
    await renderReview({}, true, true);

    await screen.findByTestId('code-agent.yaml');
    await waitFor(() => expect(draftCount()).toBe(1));
    await waitFor(() => expect(deployButton()).toBeEnabled());
    await user.click(deployButton());

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(draftCount()).toBe(0);
  });

  it('keeps the draft when the create is refused', async () => {
    const user = userEvent.setup();
    await renderReview(
      { createError: new Error('conflict: agent already exists') },
      true,
      true,
    );

    await screen.findByTestId('code-agent.yaml');
    await waitFor(() => expect(deployButton()).toBeEnabled());
    await user.click(deployButton());

    expect(await screen.findByText('Refused')).toBeInTheDocument();
    expect(draftCount()).toBe(1);
  });

  it("shows a viewer's Forbidden in agent-manager's words and stays on the page", async () => {
    const user = userEvent.setup();
    await renderReview({
      createError: new Error(
        'forbidden: helmreleases.helm.toolkit.fluxcd.io is forbidden: User "oidc:viewer@lab.local" cannot create resource "helmreleases" in the namespace "kagent"',
      ),
    });

    await screen.findByTestId('code-agent.yaml');
    await waitFor(() => expect(deployButton()).toBeEnabled());
    await user.click(deployButton());

    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
    expect(
      screen.getByText(/User "oidc:viewer@lab.local" cannot create/),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows a conflict for an existing name as agent-manager reports it', async () => {
    const user = userEvent.setup();
    await renderReview({
      createError: new Error(
        'conflict: agent kagent/go-service-reviewer already exists',
      ),
    });

    await screen.findByTestId('code-agent.yaml');
    await waitFor(() => expect(deployButton()).toBeEnabled());
    await user.click(deployButton());

    expect(await screen.findByText('Refused')).toBeInTheDocument();
    expect(
      screen.getByText('agent kagent/go-service-reviewer already exists'),
    ).toBeInTheDocument();
  });

  it('offers the connect step when the muster session is not connected to agent-manager', async () => {
    await renderReview({
      validateError: new Error(
        'failed to connect to server agent-manager: user not authenticated to server agent-manager',
      ),
    });

    expect(
      await screen.findByText('Connect to agent-manager'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(deployButton()).toBeDisabled();
  });

  it('hides the pull-request alternative while agent-manager does not report the capability', async () => {
    await renderReview();
    await screen.findByTestId('code-agent.yaml');
    expect(
      screen.queryByRole('button', { name: /Propose as pull request/ }),
    ).not.toBeInTheDocument();
  });

  it('offers the pull-request alternative once agent-manager reports it, and shows the pull request it opened', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderReview({
      info: { capabilities: { ...INFO.capabilities, commit: true } },
    });

    await screen.findByTestId('code-agent.yaml');
    const commit = await screen.findByRole('button', {
      name: 'Propose as pull request instead',
    });
    await waitFor(() => expect(commit).toBeEnabled());
    await user.click(commit);

    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_agent-manager_create_agent',
        expect.objectContaining({ mode: 'commit' }),
        'gazelle',
      ),
    );
    expect(
      await screen.findByText(/Pull request #7 opened/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review pull request ↗' }),
    ).toHaveAttribute('href', 'https://github.com/org/gitops/pull/7');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('drops the kept draft once the pull request is open, and keeps showing the form', async () => {
    const user = userEvent.setup();
    await renderReview(
      { info: { capabilities: { ...INFO.capabilities, commit: true } } },
      true,
      true,
    );

    await screen.findByTestId('code-agent.yaml');
    await waitFor(() => expect(draftCount()).toBe(1));
    const commit = await screen.findByRole('button', {
      name: 'Propose as pull request instead',
    });
    await waitFor(() => expect(commit).toBeEnabled());
    await user.click(commit);

    expect(
      await screen.findByText(/Pull request #7 opened/),
    ).toBeInTheDocument();
    expect(draftCount()).toBe(0);
    expect(plainRow('Name')).toHaveTextContent('Go service reviewer');
  });

  it('moves the pull-request alternative out of the footer at phone width', async () => {
    const layout = mockPhoneLayout();
    try {
      const user = userEvent.setup();
      const { callTool } = await renderReview({
        info: { capabilities: { ...INFO.capabilities, commit: true } },
      });

      await screen.findByTestId('code-agent.yaml');
      const commit = await screen.findByRole('button', {
        name: 'Propose as pull request instead',
      });
      // One row in the footer: Back (an icon) and Create; the alternative is
      // on the page, above the technical details.
      const footer = screen.getByRole('contentinfo');
      expect(footer).not.toContainElement(commit);
      expect(
        within(footer)
          .getAllByRole('button')
          .map(
            button => button.getAttribute('aria-label') ?? button.textContent,
          ),
      ).toEqual(['Back', 'Create agent']);

      await waitFor(() => expect(commit).toBeEnabled());
      await user.click(commit);
      await waitFor(() =>
        expect(callTool).toHaveBeenCalledWith(
          'x_agent-manager_create_agent',
          expect.objectContaining({ mode: 'commit' }),
          'gazelle',
        ),
      );
    } finally {
      layout.restore();
    }
  });

  it("renders the manual fallback from agent-manager's values and chart", async () => {
    await renderReview({}, false);

    await screen.findByTestId('code-agent.yaml');
    const values = screen.getByTestId('code-go-service-reviewer-values.yaml');
    expect(values).toHaveTextContent('name: go-service-reviewer');
    expect(values).toHaveTextContent('harness: kagent');
    expect(values).not.toHaveTextContent('skills');
    const command = screen.getByTestId('code-command').textContent ?? '';
    expect(command).toContain('helm install go-service-reviewer');
    expect(command).toContain('oci://gsoci.azurecr.io/charts/giantswarm/agent');
    expect(command).toContain('--version 1.0.0');
    expect(command).toContain('--namespace kagent');
    expect(command).toContain('--values go-service-reviewer-values.yaml');
  });
});
