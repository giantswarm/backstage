import { ReactNode, useEffect } from 'react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { musterApiRef, type MusterApi } from '@giantswarm/backstage-plugin-muster';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import type {
  AgentManagerInfo,
  AgentSpec,
  ValidateAgentResult,
} from '../../lib/agentManager';
import type { DiscoveredSkill } from '../../lib/skills';
import { agentsRouteRef } from '../../routes';
import { NewAgentFormProvider, useNewAgentForm } from '../NewAgentFormProvider';
import { NewAgentReviewPage } from './NewAgentReviewPage';

// Header actions land in the shared plugin header, outside this tree; the page
// renders the same Deploy in its own card, which is what is driven.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: jest.fn(),
}));

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

// The MCPServer CRs the toolset section groups by; nothing here is under test.
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({ resources: [], isLoading: false, errors: [] }),
}));

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => (installation: string, name: string) =>
    `https://avatars.${installation}.example/v1/${name}.png`,
}));

// CodeMirror does not lay out in jsdom; a plain block exposes the YAML the
// page hands it, which is what the assertions read.
jest.mock('../CodeBlock', () => ({
  CodeBlock: ({ content, filename }: { content: string; filename?: string }) => (
    <pre data-testid={`code-${filename ?? 'command'}`}>{content}</pre>
  ),
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
    agentTemplate: 'kagent.dev/v1alpha3',
    harness: 'kagent.dev/v1alpha3',
    remoteMcpServer: 'kagent.dev/v1alpha3',
    modelConfig: 'kagent.dev/v1alpha3',
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
          spec.skills && 'git' in spec.skills[0] ? spec.skills[0].git.commit : ''
        }\n`,
      ].join('\n'),
      values,
    },
  };
}

type Scenario = {
  info?: Partial<AgentManagerInfo>;
  /** Violations the dry run reports instead of a clean result. */
  violations?: string[];
  /** What create_agent does: succeed, or throw this error. */
  createError?: Error;
  /** The dry run itself is refused (thrown), e.g. a not-connected session. */
  validateError?: Error;
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
          return scenario.violations
            ? { ...result, valid: false, errors: scenario.violations }
            : result;
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
              ? { pullRequestUrl: 'https://github.com/org/gitops/pull/7' }
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
}: {
  children: ReactNode;
  withSkill?: boolean;
}) {
  const {
    setName,
    setDescription,
    setSystemMessage,
    setInstallation,
    selectModelConfig,
    toggleSkill,
    setToolset,
    isComplete,
  } = useNewAgentForm();
  useEffect(() => {
    setName('Go service reviewer');
    setDescription('Reviews pull requests.');
    setSystemMessage('You review pull requests.');
    setInstallation('gazelle');
    selectModelConfig('opus-4-7', 'kagent');
    if (withSkill) {
      toggleSkill(SKILL);
    }
    setToolset(['preset:read-only']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return isComplete ? <>{children}</> : null;
}

async function renderReview(scenario: Scenario = {}, withSkill = true) {
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
        <NewAgentFormProvider>
          <Seed withSkill={withSkill}>
            <NewAgentReviewPage />
          </Seed>
        </NewAgentFormProvider>
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );
  return { callTool };
}

const deployButton = () =>
  within(
    screen.getByRole('heading', { name: 'Deploy' }).parentElement as HTMLElement,
  ).getByRole('button', { name: /Deploy agent|Deploying…/ });

function specSentTo(callTool: jest.Mock, tool: string): AgentSpec {
  const call = callTool.mock.calls.find(([name]) => name === tool);
  expect(call).toBeDefined();
  return call![1] as AgentSpec;
}

beforeEach(() => {
  mockNavigate.mockReset();
});

describe('NewAgentReviewPage', () => {
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
          git: { url: 'https://github.com/giantswarm/agent-skills', commit: HEAD },
        },
      ],
      toolset: ['preset:read-only'],
    });
    expect(spec).not.toHaveProperty('runtime');

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
    // The skills summary names the pin.
    expect(screen.getByText('@cb1fb76')).toBeInTheDocument();
    // Validated against the chart schema agent-manager named.
    expect(
      screen.getByText(/Values validated against the chart's schema/),
    ).toHaveTextContent('1.0.0 (registry)');
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
        '/agent-platform/agents/gazelle/kagent/go-service-reviewer',
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

  it('hides Commit while agent-manager does not report the capability', async () => {
    await renderReview();
    await screen.findByTestId('code-agent.yaml');
    expect(
      screen.queryByRole('button', { name: /Commit/ }),
    ).not.toBeInTheDocument();
  });

  it('offers Commit once agent-manager reports it, and shows the pull request it opened', async () => {
    const user = userEvent.setup();
    const { callTool } = await renderReview({
      info: { capabilities: { ...INFO.capabilities, commit: true } },
    });

    await screen.findByTestId('code-agent.yaml');
    const commit = await screen.findByRole('button', { name: 'Commit' });
    await waitFor(() => expect(commit).toBeEnabled());
    await user.click(commit);

    await waitFor(() =>
      expect(callTool).toHaveBeenCalledWith(
        'x_agent-manager_create_agent',
        expect.objectContaining({ mode: 'commit' }),
        'gazelle',
      ),
    );
    expect(await screen.findByText('Pull request opened')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the pull request ↗' }),
    ).toHaveAttribute('href', 'https://github.com/org/gitops/pull/7');
    expect(mockNavigate).not.toHaveBeenCalled();
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
