import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { AGENT_CREATED_STATE_KEY } from '../../hooks/useAgentCreatedHandoff';
import type {
  AgentManagerAgent,
  AgentManagerInfo,
  AgentSkillEntry,
  AgentUpdate,
} from '../../lib/agentManager';
import { agentsRouteRef } from '../../routes';
import { EditAgentPage } from './EditAgentPage';

// Header actions land in the shared plugin header, outside this tree; the page
// renders the same Cancel / Commit / Save in its footer card, which is driven.
jest.mock('@giantswarm/backstage-plugin-ui-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-ui-react'),
  useProvidePageHeaderActions: jest.fn(),
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({
    installation: 'gazelle',
    namespace: 'kagent',
    name: 'pr-reviewer',
  }),
}));

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
    isLoading: false,
    error: null,
    hasRepositories: true,
    failedRepositories: [],
    truncated: false,
  }),
}));

// The toolset field's muster reads (presets, resolution, the MCPServer CRs) are
// not under test here; the field's own model is `lib/toolset.ts`.
jest.mock('../../hooks/useToolsetResolution', () => ({
  useToolsetResolution: () => ({
    tools: [],
    unmatched: [],
    truncated: false,
    isLoading: false,
    status: 'resolved',
  }),
}));
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: () => ({ resources: [], isLoading: false, errors: [] }),
}));

// CodeMirror does not lay out in jsdom; a plain block exposes the YAML.
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

const AGENT: AgentManagerAgent = {
  name: 'pr-reviewer',
  namespace: 'kagent',
  exists: true,
  displayName: 'PR reviewer',
  description: 'Reviews pull requests.',
  systemMessage: 'You review pull requests.',
  modelConfig: 'opus-4-7',
  skills: [PR_REVIEW],
  toolset: ['preset:read-only'],
  ready: true,
  managed: 'helmrelease',
  helmRelease: {
    name: 'pr-reviewer',
    namespace: 'kagent',
    ready: true,
    suspended: false,
    gitOpsOwned: false,
    deleting: false,
  },
  values: {
    agent: { name: 'pr-reviewer', displayName: 'PR reviewer' },
    modelConfig: { name: 'opus-4-7' },
    toolset: ['preset:read-only'],
    skills: [PR_REVIEW],
  },
};

const INFO: Partial<AgentManagerInfo> = {
  capabilities: { commit: false },
  harness: { name: 'kagent' },
  chart: {
    ociUrl: 'oci://gsoci.azurecr.io/charts/giantswarm/agent',
    semver: '1.x',
    schemaVersion: '1.0.0',
    schemaSource: 'registry',
  },
};

type Scenario = {
  info?: Partial<AgentManagerInfo>;
  agent?: AgentManagerAgent;
  servers?: { name: string }[];
  violations?: string[];
  validateError?: Error;
  updateError?: Error;
};

function makeMusterApi(scenario: Scenario = {}) {
  const agent = scenario.agent ?? AGENT;
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      switch (name) {
        case 'x_agent-manager_get_info':
          return { ...INFO, ...scenario.info };
        case 'x_agent-manager_get_agent':
          return agent;
        case 'x_agent-manager_list_model_configs':
          return {
            modelConfigs: [
              {
                name: 'opus-4-7',
                namespace: 'kagent',
                model: 'claude-opus-4-7',
                accepted: true,
              },
              {
                name: 'sonnet-4-5',
                namespace: 'kagent',
                model: 'claude-sonnet-4-5',
                accepted: true,
              },
            ],
          };
        case 'x_agent-manager_validate_agent': {
          if (scenario.validateError) {
            throw scenario.validateError;
          }
          const update = args as AgentUpdate & { update: boolean };
          const values = {
            ...agent.values,
            agent: {
              ...(agent.values?.agent as object),
              ...(update.description !== undefined
                ? { description: update.description }
                : {}),
            },
            ...(update.skills ? { skills: update.skills } : {}),
            ...(update.toolset ? { toolset: update.toolset } : {}),
          };
          return {
            valid: !scenario.violations,
            mode: 'update',
            errors: scenario.violations,
            schemaVersion: '1.0.0',
            schemaSource: 'registry',
            manifests: { ociRepository: '', helmRelease: '', values },
          };
        }
        case 'x_agent-manager_update_agent':
          if (scenario.updateError) {
            throw scenario.updateError;
          }
          return {
            agent,
            before: agent.values,
            after: agent.values,
            changed: ['agent.description'],
            manifests: {
              ociRepository: '',
              helmRelease: '',
              values: agent.values,
            },
            requestedBy: 'admin@lab.local',
          };
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  const listServers = jest.fn(async () => ({
    mcpServers: scenario.servers ?? [{ name: 'agent-manager' }],
  }));
  const filterTools = jest.fn(async () => ({
    total: 0,
    filtered_count: 0,
    truncated: false,
    tools: [],
    presets: [],
  }));
  return {
    api: { callTool, listServers, filterTools } as unknown as MusterApi,
    callTool,
  };
}

async function renderPage(scenario: Scenario = {}) {
  const { api, callTool } = makeMusterApi(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <EditAgentPage />
      </QueryClientProvider>
    </TestApiProvider>,
    { mountedRoutes: { '/agent-platform/agents': agentsRouteRef } },
  );
  return { callTool };
}

/** The Save button of the footer card (the header's twin). */
function saveButton() {
  return screen.getByRole('button', { name: /^Save/ });
}

beforeEach(() => {
  mockNavigate.mockReset();
});

describe('EditAgentPage', () => {
  it("pre-fills every field from get_agent's reading and offers no runtime", async () => {
    await renderPage();

    expect(await screen.findByDisplayValue('PR reviewer')).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('Reviews pull requests.'),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue('You review pull requests.'),
    ).toBeInTheDocument();
    // The mounted skill is selected on its card, at its pin.
    const card = screen.getByRole('checkbox', { name: 'Skill PR review' });
    expect(card).toHaveAttribute('aria-checked', 'true');
    expect(card).toHaveTextContent(`pinned at ${HEAD.slice(0, 12)}`);
    // The toolset arrives as selected.
    expect(
      screen.getByRole('checkbox', { name: 'Preset read-only' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByLabelText(/runtime/i)).not.toBeInTheDocument();
    expect(screen.getByText('Nothing changed yet.')).toBeInTheDocument();
  });

  it('reviews the dry run of exactly the changed fields and saves them, nothing else', async () => {
    const { callTool } = await renderPage();
    const description = await screen.findByDisplayValue(
      'Reviews pull requests.',
    );

    await userEvent.clear(description);
    await userEvent.type(description, 'Reviews Go pull requests.');

    // The review names the changed field and renders agent-manager's dry run.
    const changed = await screen.findByRole('list', { name: 'Changed fields' });
    expect(within(changed).getByText('Description')).toBeInTheDocument();
    expect(
      within(changed).queryByText('System prompt'),
    ).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByTestId('code-pr-reviewer-values.yaml'),
      ).toHaveTextContent('description: Reviews Go pull requests.');
    });
    const dryRun = callTool.mock.calls.filter(
      ([tool]) => tool === 'x_agent-manager_validate_agent',
    );
    expect(dryRun.at(-1)?.[1]).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      description: 'Reviews Go pull requests.',
      update: true,
    });

    await waitFor(() => expect(saveButton()).toBeEnabled());
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
    const write = callTool.mock.calls.find(
      ([tool]) => tool === 'x_agent-manager_update_agent',
    );
    expect(write?.[1]).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      description: 'Reviews Go pull requests.',
    });
    expect(write?.[1]).not.toHaveProperty('force');
    expect(write?.[1]).not.toHaveProperty('runtime');
    // The detail page is handed the write to watch converge.
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining(
        '/agent-platform/agents/gazelle/kagent/pr-reviewer',
      ),
      {
        state: {
          [AGENT_CREATED_STATE_KEY]: expect.objectContaining({
            action: 'updated',
            requestedBy: 'admin@lab.local',
          }),
        },
      },
    );
  });

  it('sends an emptied field as "" — back to the chart default', async () => {
    const { callTool } = await renderPage();
    const prompt = await screen.findByDisplayValue('You review pull requests.');
    await userEvent.clear(prompt);

    await waitFor(() => expect(saveButton()).toBeEnabled());
    await userEvent.click(saveButton());

    await waitFor(() => {
      expect(
        callTool.mock.calls.find(
          ([tool]) => tool === 'x_agent-manager_update_agent',
        )?.[1],
      ).toEqual({
        namespace: 'kagent',
        name: 'pr-reviewer',
        systemMessage: '',
      });
    });
  });

  it('adds a skill pinned to the head commit its card shows', async () => {
    const { callTool } = await renderPage();
    await screen.findByDisplayValue('PR reviewer');

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Skill Incident responder' }),
    );

    await waitFor(() => {
      const dryRun = callTool.mock.calls
        .filter(([tool]) => tool === 'x_agent-manager_validate_agent')
        .at(-1);
      expect((dryRun?.[1] as AgentUpdate).skills).toEqual([
        PR_REVIEW,
        {
          name: 'Incident responder',
          path: 'incident',
          git: { url: REPO, commit: OTHER },
        },
      ]);
    });
  });

  it("shows agent-manager's violations and keeps Save locked", async () => {
    await renderPage({
      violations: [
        'values do not satisfy the agent chart schema 1.0.0: agent.displayName: String length must be less than or equal to 63',
      ],
    });
    const name = await screen.findByDisplayValue('PR reviewer');
    await userEvent.type(name, ' with a longer name');

    expect(
      await screen.findByText(/String length must be less than or equal to 63/),
    ).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("shows agent-manager's refusal for a GitOps-owned agent verbatim, Save locked", async () => {
    const message =
      'HelmRelease kagent/pr-reviewer is applied by Flux Kustomization "agents": its desired state lives in git, a live write would be undone. Change it in the GitOps repository, or pass force to write anyway';
    await renderPage({ validateError: new Error(`conflict: ${message}`) });
    const description = await screen.findByDisplayValue(
      'Reviews pull requests.',
    );
    await userEvent.type(description, ' Again.');

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByText('Refused')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("shows the apiserver's Forbidden when a viewer saves", async () => {
    await renderPage({
      updateError: new Error(
        'forbidden: update HelmRelease kagent/pr-reviewer: helmreleases.helm.toolkit.fluxcd.io "pr-reviewer" is forbidden: User "oidc:viewer@lab.local" cannot update resource "helmreleases"',
      ),
    });
    const description = await screen.findByDisplayValue(
      'Reviews pull requests.',
    );
    await userEvent.type(description, ' Again.');
    await waitFor(() => expect(saveButton()).toBeEnabled());
    await userEvent.click(saveButton());

    expect(await screen.findByText('Not permitted')).toBeInTheDocument();
    expect(
      screen.getByText(/User "oidc:viewer@lab.local" cannot update/),
    ).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('hides Commit until agent-manager reports the capability', async () => {
    await renderPage();
    await screen.findByDisplayValue('PR reviewer');
    expect(
      screen.queryByRole('button', { name: /Commit/ }),
    ).not.toBeInTheDocument();
  });

  it('offers Commit under the capability flag', async () => {
    await renderPage({ info: { capabilities: { commit: true } } });
    await screen.findByDisplayValue('PR reviewer');
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /Commit/ }),
      ).toBeInTheDocument();
    });
  });

  it('says why nothing can be edited when muster lists no agent-manager', async () => {
    await renderPage({ servers: [{ name: 'mcp-kubernetes' }] });

    expect(
      await screen.findByText('This agent cannot be edited from here'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/muster on gazelle lists no agent-manager/),
    ).toBeInTheDocument();
    expect(screen.queryByDisplayValue('PR reviewer')).not.toBeInTheDocument();
  });
});
