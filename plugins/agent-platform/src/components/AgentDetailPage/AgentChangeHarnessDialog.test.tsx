import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Harness } from '@giantswarm/backstage-plugin-kubernetes-react';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useUpdateAgent } from '../../hooks/useUpdateAgent';
import { committedTo } from '../../lib/__fixtures__/gitOpsCommit';
import type { AgentManagerAgent } from '../../lib/agentManager';
import { AgentChangeHarnessDialog } from './AgentChangeHarnessDialog';

const mockUseResources = jest.fn();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useResources: (...args: unknown[]) => mockUseResources(...args),
}));

function harness(
  name: string,
  runtime: 'kagent' | 'claude' | 'codex',
): Harness {
  return new Harness(
    {
      apiVersion: 'api.kagent.dev/v1alpha3',
      kind: 'Harness',
      metadata: { name, namespace: 'kagent' },
      spec: {
        [runtime]: {},
        workload: { image: `registry.example/${name}-harness@sha256:0123` },
      },
    } as never,
    'gazelle',
  );
}

const HARNESSES = [
  harness('kagent', 'kagent'),
  harness('claude', 'claude'),
  harness('codex', 'codex'),
];

const AGENT: AgentManagerAgent = {
  name: 'pr-reviewer',
  namespace: 'kagent',
  exists: true,
  displayName: 'PR reviewer',
  harness: 'kagent',
  toolset: ['preset:read-only'],
  ready: true,
  managed: 'helmrelease',
};

const CODEX_REFUSAL =
  'modelConfig default-model-config (provider Anthropic, model claude-sonnet-4-6): Harness codex runs Codex, which speaks the OpenAI Responses API only: pick an OpenAI ModelConfig with openAI.apiFormat responses, or a Bedrock gpt-* one';

type Scenario = {
  /** validate_agent's violations, per Harness. */
  violations?: Record<string, string[]>;
  validateError?: Error;
  updateError?: Error;
  /** The dialog is open in commit mode: an agent applied from git. */
  commit?: boolean;
};

function makeMusterApi(scenario: Scenario = {}) {
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      switch (name) {
        case 'x_agent-manager_get_info':
          return { harness: { name: 'kagent' } };
        case 'x_agent-manager_validate_agent': {
          if (scenario.validateError) {
            throw scenario.validateError;
          }
          const errors = scenario.violations?.[args.harness as string];
          return {
            valid: !errors,
            errors,
            mode: 'update',
            manifests: { ociRepository: '', helmRelease: '', values: {} },
          };
        }
        case 'x_agent-manager_update_agent':
          if (scenario.updateError) {
            throw scenario.updateError;
          }
          if (args.mode === 'commit' && args.dryRun) {
            return {
              ...committedTo(),
              dryRun: true,
              agent: AGENT,
              before: {},
              after: {},
              changed: ['agent.harness'],
              manifests: { ociRepository: '', helmRelease: '', values: {} },
            };
          }
          if (args.mode === 'commit') {
            return committedTo('https://github.com/giantswarm/agents/pull/9');
          }
          return {
            agent: { ...AGENT, harness: args.harness },
            before: { agent: { harness: 'kagent' } },
            after: { agent: { harness: args.harness } },
            changed: ['agent.harness'],
            manifests: { ociRepository: '', helmRelease: '', values: {} },
            requestedBy: 'admin@lab.local',
          };
        default:
          throw new Error(`unexpected tool ${name}`);
      }
    },
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

const analyticsApi = mockApis.analytics.mock();
const onChanged = jest.fn();
const onOpenChange = jest.fn();

function Host({ mode }: { mode: 'apply' | 'commit' }) {
  const updating = useUpdateAgent('gazelle');
  return (
    <AgentChangeHarnessDialog
      installation="gazelle"
      namespace="kagent"
      name="pr-reviewer"
      displayName="PR reviewer"
      currentHarness="kagent"
      isOpen
      mode={mode}
      onOpenChange={onOpenChange}
      updating={updating}
      editHref="/agents/gazelle/kagent/pr-reviewer/edit"
      onChanged={onChanged}
    />
  );
}

async function renderDialog(scenario: Scenario = {}) {
  const { api, callTool } = makeMusterApi(scenario);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await renderInTestApp(
    <TestApiProvider
      apis={[
        [musterApiRef, api],
        [analyticsApiRef, analyticsApi],
      ]}
    >
      <QueryClientProvider client={queryClient}>
        <Host mode={scenario.commit ? 'commit' : 'apply'} />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

function calls(callTool: jest.Mock, tool: string) {
  return callTool.mock.calls
    .filter(([name]) => name === `x_agent-manager_${tool}`)
    .map(([, args]) => args);
}

beforeEach(() => {
  onChanged.mockReset();
  onOpenChange.mockReset();
  mockUseResources.mockReset();
  mockUseResources.mockReturnValue({
    resources: HARNESSES,
    errors: [],
    isLoading: false,
  });
});

describe('AgentChangeHarnessDialog', () => {
  it("lists the namespace's Harnesses with the current one shown and not pickable, and asks nothing until another is picked", async () => {
    const { callTool } = await renderDialog();

    const runtime = screen.getByRole('radiogroup', { name: 'Runtime' });
    const cards = within(runtime).getAllByRole('radio');
    expect(cards).toHaveLength(3);
    const current = within(runtime).getByRole('radio', {
      name: /Harness kagent, current runtime/,
    });
    expect(current).toHaveAttribute('aria-disabled', 'true');
    expect(current).toHaveTextContent('Current runtime');
    expect(
      screen.getByText(/Running Sessions stay on Declarative \(Go ADK\)/),
    ).toBeInTheDocument();
    expect(calls(callTool, 'validate_agent')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Change Harness' }),
    ).toBeDisabled();
  });

  it('lists every check the new Harness refuses, blocks the change and links to the edit page', async () => {
    const { callTool } = await renderDialog({
      violations: { codex: [CODEX_REFUSAL] },
    });

    await userEvent.click(
      screen.getByRole('radio', { name: /Codex, Harness codex/ }),
    );

    const violations = await screen.findByRole('list', { name: 'Violations' });
    expect(violations).toHaveTextContent(
      'speaks the OpenAI Responses API only',
    );
    expect(screen.getByText('Codex refuses this agent')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Edit the agent' }),
    ).toHaveAttribute('href', '/agents/gazelle/kagent/pr-reviewer/edit');
    expect(
      screen.getByRole('button', { name: 'Change Harness' }),
    ).toBeDisabled();
    expect(calls(callTool, 'validate_agent')).toEqual([
      {
        namespace: 'kagent',
        name: 'pr-reviewer',
        harness: 'codex',
        update: true,
      },
    ]);
    expect(calls(callTool, 'update_agent')).toHaveLength(0);
  });

  it("shows agent-manager's refusal of the dry run itself and blocks the change", async () => {
    await renderDialog({
      validateError: new Error(
        'invalid_request: harness "opencode" does not exist in namespace kagent',
      ),
    });

    await userEvent.click(
      screen.getByRole('radio', { name: /Codex, Harness codex/ }),
    );

    expect(
      await screen.findByText('agent-manager refuses the change'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not exist in namespace kagent/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Change Harness' }),
    ).toBeDisabled();
  });

  it('moves the agent with harness and nothing else once every check passes, and reports the runtimes before and after', async () => {
    const { callTool } = await renderDialog({
      violations: { codex: [CODEX_REFUSAL] },
    });

    await userEvent.click(
      screen.getByRole('radio', { name: /Claude Code, Harness claude/ }),
    );
    expect(await screen.findByText(/Every check passes/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /new Sessions start on Claude Code once its revision is Ready/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Change Harness' }),
    );

    await waitFor(() =>
      expect(onChanged).toHaveBeenCalledWith(
        'Declarative (Go ADK)',
        'Claude Code',
        'admin@lab.local',
        undefined,
      ),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(calls(callTool, 'update_agent')).toEqual([
      { namespace: 'kagent', name: 'pr-reviewer', harness: 'claude' },
    ]);
  });

  it('keeps the dialog open with the write refused in agent-manager’s words', async () => {
    await renderDialog({
      updateError: new Error(
        'invalid_request: egress origin "https://example.com" is not one of Harness claude\'s origins',
      ),
    });

    await userEvent.click(
      screen.getByRole('radio', { name: /Claude Code, Harness claude/ }),
    );
    await screen.findByText(/Every check passes/);
    await userEvent.click(
      screen.getByRole('button', { name: 'Change Harness' }),
    );

    expect(
      await screen.findByText(/is not one of Harness claude's origins/),
    ).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('opens a pull request for an agent applied from git and shows it', async () => {
    const { callTool } = await renderDialog({ commit: true });

    expect(
      screen.getByText(/agent-manager opens a pull request as you/),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('radio', { name: /Claude Code, Harness claude/ }),
    );
    expect(
      await screen.findByText(
        /Confirming opens a pull request moving the agent to Claude Code/,
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open pull request' }),
    );

    expect(
      await screen.findByRole('link', { name: /Review pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/agents/pull/9');
    expect(onChanged).not.toHaveBeenCalled();
    expect(calls(callTool, 'validate_agent')).toEqual([
      {
        namespace: 'kagent',
        name: 'pr-reviewer',
        harness: 'claude',
        update: true,
        mode: 'commit',
      },
    ]);
    expect(
      calls(callTool, 'update_agent').filter(args => !args.dryRun),
    ).toEqual([
      {
        namespace: 'kagent',
        name: 'pr-reviewer',
        harness: 'claude',
        mode: 'commit',
      },
    ]);
  });
});
