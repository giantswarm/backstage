import { analyticsApiRef } from '@backstage/frontend-plugin-api';
import { mockApis, renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useUpdateAgent } from '../../hooks/useUpdateAgent';
import { committedTo } from '../../lib/__fixtures__/gitOpsCommit';
import type {
  AgentManagerAgent,
  AgentSkillEntry,
} from '../../lib/agentManager';
import { AgentUpdateSkillsDialog } from './AgentUpdateSkillsDialog';

const PINNED = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const HEAD = '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b';
const REPO = 'https://github.com/giantswarm/agent-skills';
const OCI =
  'gsoci.azurecr.io/giantswarm/skills/runbooks@sha256:0123456789abcdef0123';

const CURRENT: AgentSkillEntry[] = [
  { name: 'pr-review', path: 'pr-review', git: { url: REPO, commit: PINNED } },
  { name: 'incident', path: 'incident', git: { url: REPO, commit: HEAD } },
  { name: 'runbooks', oci: OCI },
];

const AGENT: AgentManagerAgent = {
  name: 'pr-reviewer',
  namespace: 'kagent',
  exists: true,
  displayName: 'PR reviewer',
  skills: CURRENT,
  toolset: ['preset:read-only'],
  ready: true,
  managed: 'helmrelease',
};

type Scenario = {
  /** What the dry run with refreshSkills would write; default: pr-review moves to HEAD. */
  refreshed?: AgentSkillEntry[];
  validateError?: Error;
  updateError?: Error;
  /** What update_agent's commit dry run throws (the confirm's write still works). */
  commitDryRunError?: Error;
  /** What only the pull request itself throws (the dry run passed). */
  commitError?: Error;
  /** What the commit dry run would write; default: what validate_agent answered. */
  committed?: AgentSkillEntry[];
  /** Holds the agent's read until it settles. */
  agentHeld?: Promise<void>;
  /** Holds validate_agent's answer until it settles. */
  validateHeld?: Promise<void>;
  /** Holds the commit dry run's answer until it settles. */
  commitDryRunHeld?: Promise<void>;
  /** validate_agent's violations. */
  violations?: string[];
  /** How many skills the page shows for the agent. */
  skillCount?: number;
  /** The dialog is open in commit mode: an agent applied from git. */
  commit?: boolean;
};

// As agent-manager answers it over MCP: the code, then its wrapped error.
const MISSING_RELEASE_FILE = new Error(
  "conflict: conflict: HelmRelease flux-giantswarm/pr-reviewer-agent is not in agent-manager's directory management-clusters/gazelle/extras/agent-manager of giantswarm/giantswarm-management-clusters (no management-clusters/gazelle/extras/agent-manager/pr-reviewer-agent.yaml there): change it in the file that defines it",
);
const MISSING_PATH =
  'management-clusters/gazelle/extras/agent-manager/pr-reviewer-agent.yaml';
const HEAD2 = '4e6d8c0a2b4f6e8d0c2a4b6d8f0e2c4a6b8d0f2e';

function commitDryRuns(callTool: jest.Mock) {
  return callTool.mock.calls.filter(
    ([tool, args]) => tool === 'x_agent-manager_update_agent' && args.dryRun,
  );
}

function makeMusterApi(scenario: Scenario = {}) {
  const refreshed = scenario.refreshed ?? [
    { name: 'pr-review', path: 'pr-review', git: { url: REPO, commit: HEAD } },
    { name: 'incident', path: 'incident', git: { url: REPO, commit: HEAD } },
    { name: 'runbooks', oci: OCI },
  ];
  const callTool = jest.fn(
    async (name: string, args: Record<string, unknown>) => {
      switch (name) {
        case 'x_agent-manager_get_agent':
          await scenario.agentHeld;
          return AGENT;
        case 'x_agent-manager_validate_agent':
          await scenario.validateHeld;
          if (scenario.validateError) {
            throw scenario.validateError;
          }
          expect(args).toEqual({
            namespace: 'kagent',
            name: 'pr-reviewer',
            refreshSkills: true,
            update: true,
            ...(scenario.commit ? { mode: 'commit' } : {}),
          });
          return {
            valid: !scenario.violations,
            errors: scenario.violations,
            mode: 'update',
            schemaVersion: '1.0.0',
            schemaSource: 'registry',
            manifests: {
              ociRepository: '',
              helmRelease: '',
              values: { skills: refreshed },
            },
          };
        case 'x_agent-manager_update_agent':
          if (scenario.updateError) {
            throw scenario.updateError;
          }
          if (args.mode === 'commit' && args.dryRun) {
            await scenario.commitDryRunHeld;
            if (scenario.commitDryRunError) {
              throw scenario.commitDryRunError;
            }
            return {
              ...committedTo(),
              dryRun: true,
              agent: AGENT,
              before: { skills: CURRENT },
              after: { skills: scenario.committed ?? refreshed },
              changed: ['skills'],
              manifests: { ociRepository: '', helmRelease: '', values: {} },
            };
          }
          if (args.mode === 'commit') {
            if (scenario.commitError) {
              throw scenario.commitError;
            }
            return committedTo('https://github.com/giantswarm/agents/pull/7');
          }
          return {
            agent: { ...AGENT, skills: refreshed },
            before: { skills: CURRENT },
            after: { skills: refreshed },
            changed: ['skills'],
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
const onUpdated = jest.fn();
const onOpenChange = jest.fn();

function Host({
  mode,
  skillCount,
}: {
  mode?: 'apply' | 'commit';
  skillCount?: number;
}) {
  const updating = useUpdateAgent('gazelle');
  return (
    <AgentUpdateSkillsDialog
      installation="gazelle"
      namespace="kagent"
      name="pr-reviewer"
      displayName="PR reviewer"
      isOpen
      mode={mode}
      skillCount={skillCount}
      onOpenChange={onOpenChange}
      updating={updating}
      onUpdated={onUpdated}
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
        <Host
          mode={scenario.commit ? 'commit' : 'apply'}
          skillCount={scenario.skillCount}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

beforeEach(() => {
  onUpdated.mockReset();
  onOpenChange.mockReset();
  jest.mocked(analyticsApi.captureEvent).mockClear();
});

describe('AgentUpdateSkillsDialog', () => {
  it('shows, per git skill, the pinned commit next to the default-branch head and which entries change; digest-pinned skills are left alone', async () => {
    await renderDialog();

    const moving = await screen.findByTestId('skill-refresh-pr-review');
    expect(within(moving).getByTitle(PINNED)).toHaveTextContent(
      PINNED.slice(0, 12),
    );
    expect(within(moving).getByTitle(HEAD)).toHaveTextContent(
      HEAD.slice(0, 12),
    );
    expect(moving).toHaveTextContent('Moves to the head');

    const current = screen.getByTestId('skill-refresh-incident');
    expect(current).toHaveTextContent('Already at the head');

    // The name and its source are separate lines, not one run-on string.
    const name = within(moving).getByText('pr-review');
    const source = within(moving).getByText(
      'giantswarm/agent-skills · pr-review',
    );
    expect(name.parentElement).toBe(source.parentElement);
    expect(name.parentElement).toHaveClass('bui-Flex');

    const digest = screen.getByTestId('skill-refresh-runbooks');
    expect(digest).toHaveTextContent('Pinned by digest — left alone');
    expect(digest).toHaveTextContent('n/a');
    // The digest, not the repository the Skill column already names.
    expect(within(digest).getByTitle(OCI)).toHaveTextContent(
      'sha256:0123456789ab',
    );
  });

  it('shows a placeholder row per skill the page knows of and a progress line until the skills are read, with the confirm locked', async () => {
    let settle: () => void = () => {};
    const held = new Promise<void>(resolve => (settle = resolve));
    await renderDialog({ agentHeld: held, skillCount: CURRENT.length });

    const table = screen.getByRole('table', { name: 'Skills and their pins' });
    expect(table).toHaveAttribute('aria-busy', 'true');
    expect(table.querySelectorAll('tbody tr')).toHaveLength(CURRENT.length);
    expect(
      await screen.findByText('Asking agent-manager which skills would move…'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Update all skills' }),
    ).toBeDisabled();

    settle();
    expect(
      await screen.findByText(/Confirming re-pins the skills marked above/),
    ).toBeInTheDocument();
    expect(table).toHaveAttribute('aria-busy', 'false');
    expect(
      screen.queryByText('Asking agent-manager which skills would move…'),
    ).not.toBeInTheDocument();
    // The real rows took the placeholders' place, one for one.
    expect(table.querySelectorAll('tbody tr')).toHaveLength(CURRENT.length);
    expect(screen.queryAllByTestId('cell-skeleton')).toHaveLength(0);
  });

  it('shows three placeholder rows when the page did not say how many skills there are', async () => {
    await renderDialog({ agentHeld: new Promise(() => {}) });

    expect(
      screen
        .getByRole('table', { name: 'Skills and their pins' })
        .querySelectorAll('tbody tr'),
    ).toHaveLength(3);
  });

  it('lists the pins while the dry run runs, holding the head and outcome cells in place', async () => {
    let settle: () => void = () => {};
    const held = new Promise<void>(resolve => (settle = resolve));
    await renderDialog({ validateHeld: held });

    const moving = await screen.findByTestId('skill-refresh-pr-review');
    expect(within(moving).getByTitle(PINNED)).toBeInTheDocument();
    expect(within(moving).queryByTitle(HEAD)).not.toBeInTheDocument();
    expect(moving).not.toHaveTextContent('Moves to the head');
    expect(within(moving).getAllByTestId('cell-skeleton')).toHaveLength(2);
    // A digest pin never moves, so it has nothing to wait for.
    expect(screen.getByTestId('skill-refresh-runbooks')).toHaveTextContent(
      'Pinned by digest — left alone',
    );
    // The columns are sized up front, not by what arrives.
    expect(
      screen
        .getByRole('table', { name: 'Skills and their pins' })
        .querySelectorAll('colgroup col'),
    ).toHaveLength(4);
    expect(
      screen.getByRole('button', { name: 'Update all skills' }),
    ).toBeDisabled();

    settle();
    expect(
      await within(moving).findByText('Moves to the head'),
    ).toBeInTheDocument();
    expect(within(moving).getByTitle(HEAD)).toBeInTheDocument();
    expect(within(moving).queryAllByTestId('cell-skeleton')).toHaveLength(0);
  });

  it('confirms with update_agent and refreshSkills only, then hands the result over', async () => {
    const { callTool } = await renderDialog();
    await screen.findByTestId('skill-refresh-pr-review');

    const confirm = screen.getByRole('button', { name: 'Update all skills' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'pr-review' }),
        ]),
        'admin@lab.local',
        // The pre-write generation, which the page hands to the progress. This
        // suite stubs no template generation, so there is none to pass on;
        // useUpdateAgent's own tests cover it being read and handed back.
        undefined,
      );
    });
    const write = callTool.mock.calls.find(
      ([tool]) => tool === 'x_agent-manager_update_agent',
    );
    expect(write?.[1]).toEqual({
      namespace: 'kagent',
      name: 'pr-reviewer',
      refreshSkills: true,
    });
    expect(write?.[1]).not.toHaveProperty('force');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.agentUpdated',
        attributes: { mode: 'apply', change: 'skillsRefreshed' },
      }),
    );
  });

  describe('for an agent applied from git (commit mode)', () => {
    it('asks the dry run in commit mode, lists old → new commits and says it is a pull request', async () => {
      const { callTool } = await renderDialog({ commit: true });

      const moving = await screen.findByTestId('skill-refresh-pr-review');
      expect(within(moving).getByTitle(PINNED)).toBeInTheDocument();
      // The head shows once the commit dry run has answered too.
      expect(await within(moving).findByTitle(HEAD)).toBeInTheDocument();
      expect(moving).toHaveTextContent('Moves to the head');
      expect(
        screen.getByText(/opens a pull request as you with the new pins/),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Update all skills' }),
      ).not.toBeInTheDocument();
      // Only update_agent's commit dry run, which opens nothing.
      const writes = callTool.mock.calls.filter(
        ([tool]) => tool === 'x_agent-manager_update_agent',
      );
      expect(writes.map(([, args]) => args)).toEqual([
        {
          namespace: 'kagent',
          name: 'pr-reviewer',
          refreshSkills: true,
          mode: 'commit',
          dryRun: true,
        },
      ]);
    });

    it('opens the pull request with update_agent mode: commit, shows it, and reports the commit event', async () => {
      const { callTool } = await renderDialog({ commit: true });
      await screen.findByTestId('skill-refresh-pr-review');

      const confirm = screen.getByRole('button', { name: 'Open pull request' });
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);

      expect(
        await screen.findByRole('link', { name: /Review pull request/ }),
      ).toHaveAttribute('href', 'https://github.com/giantswarm/agents/pull/7');
      const write = callTool.mock.calls.find(
        ([tool, args]) =>
          tool === 'x_agent-manager_update_agent' && !args.dryRun,
      );
      expect(write?.[1]).toEqual({
        namespace: 'kagent',
        name: 'pr-reviewer',
        refreshSkills: true,
        mode: 'commit',
      });
      // Nothing to watch converge: the agent moves once the PR is merged.
      expect(onUpdated).not.toHaveBeenCalled();
      expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(1);
      expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AgentPlatform.agentUpdated',
          attributes: { mode: 'commit', change: 'skillsRefreshed' },
        }),
      );
      // Done: only Close is left.
      expect(
        screen.queryByRole('button', { name: 'Open pull request' }),
      ).not.toBeInTheDocument();
      // The header's X and the footer's Close.
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
    });

    it("shows agent-manager's refusal when the person's GitHub authorization is missing", async () => {
      await renderDialog({
        commit: true,
        updateError: new Error(
          'auth_required: connect your GitHub account to open pull requests',
        ),
      });
      await screen.findByTestId('skill-refresh-pr-review');
      const confirm = screen.getByRole('button', { name: 'Open pull request' });
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);

      expect(
        await screen.findByText(/connect your GitHub account/),
      ).toBeInTheDocument();
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
    });

    it('says the skills are updated in the GitOps source, under the plan, and offers only Close, when the commit dry run finds no file for the release', async () => {
      const { callTool } = await renderDialog({
        commit: true,
        commitDryRunError: MISSING_RELEASE_FILE,
      });

      const title = await screen.findByText('Skills cannot be updated here');
      expect(
        screen.getByText(
          "To update the skills, change their pins in the agent's GitOps source.",
        ),
      ).toBeInTheDocument();
      // Information, not a warning, and under the plan it refers to.
      expect(title.closest('[data-status]')).toHaveAttribute(
        'data-status',
        'info',
      );
      expect(
        screen
          .getByRole('table', { name: 'Skills and their pins' })
          .compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        screen.queryByText('agent-manager cannot open this pull request'),
      ).not.toBeInTheDocument();
      expect(
        screen.getByText('flux-giantswarm/pr-reviewer-agent'),
      ).toBeInTheDocument();
      expect(screen.getByText(MISSING_PATH)).toBeInTheDocument();
      expect(
        screen.getByRole('link', {
          name: 'giantswarm/giantswarm-management-clusters',
        }),
      ).toHaveAttribute(
        'href',
        'https://github.com/giantswarm/giantswarm-management-clusters',
      );
      // The plan stays: it is what to change by hand.
      expect(screen.getByTestId('skill-refresh-pr-review')).toHaveTextContent(
        'Moves to the head',
      );
      expect(
        screen.queryByText(/opens a pull request as you/),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Open pull request' }),
      ).not.toBeInTheDocument();
      // The header's X and the footer's Close.
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
      // No question the dialog cannot say yes to.
      expect(
        screen.getByRole('heading', {
          name: 'Update the skills of "PR reviewer" in GitOps',
        }),
      ).toBeInTheDocument();
      // The head to pin by hand can be copied whole, only where the skill moves.
      expect(
        screen.getByRole('button', {
          name: 'Copy the head commit of pr-review',
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', {
          name: 'Copy the head commit of incident',
        }),
      ).not.toBeInTheDocument();
      expect(
        callTool.mock.calls.some(
          ([tool, args]) =>
            tool === 'x_agent-manager_update_agent' && !args.dryRun,
        ),
      ).toBe(false);
    });

    it('says the same when only the pull request is refused that way', async () => {
      await renderDialog({ commit: true, commitError: MISSING_RELEASE_FILE });
      await screen.findByTestId('skill-refresh-pr-review');
      const confirm = screen.getByRole('button', { name: 'Open pull request' });
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);

      expect(
        await screen.findByText('Skills cannot be updated here'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/is not in agent-manager's directory/),
      ).not.toBeInTheDocument();
      expect(confirm).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
      expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(2);
      expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
    });

    it('asks no commit dry run when every git skill is already at its head', async () => {
      const { callTool } = await renderDialog({
        commit: true,
        refreshed: CURRENT,
        commitDryRunError: MISSING_RELEASE_FILE,
      });

      expect(
        await screen.findByText(
          "Every git skill is already at its repository's default-branch head.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText('Skills cannot be updated here'),
      ).not.toBeInTheDocument();
      expect(commitDryRuns(callTool)).toHaveLength(0);
    });

    it('asks no commit dry run when validate_agent reports violations', async () => {
      const { callTool } = await renderDialog({
        commit: true,
        violations: ['skills[0]: unresolvable'],
      });

      expect(
        await screen.findByText('agent-manager refuses the update'),
      ).toBeInTheDocument();
      expect(commitDryRuns(callTool)).toHaveLength(0);
    });

    it('says it is checking while the commit dry run runs, and promises no pull request until it answers', async () => {
      let settle: () => void = () => {};
      const held = new Promise<void>(resolve => (settle = resolve));
      await renderDialog({ commit: true, commitDryRunHeld: held });

      expect(
        await screen.findByText(
          'Asking agent-manager whether it can open the pull request…',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Open pull request' }),
      ).toBeDisabled();
      expect(
        screen.queryByText(/Confirming opens a pull request/),
      ).not.toBeInTheDocument();
      // validate_agent's head is not final yet: the cells wait for the plan.
      const moving = screen.getByTestId('skill-refresh-pr-review');
      expect(within(moving).queryByTitle(HEAD)).not.toBeInTheDocument();
      expect(within(moving).getAllByTestId('cell-skeleton')).toHaveLength(2);

      settle();
      expect(
        await screen.findByText(/Confirming opens a pull request/),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(
          'Asking agent-manager whether it can open the pull request…',
        ),
      ).not.toBeInTheDocument();
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Open pull request' }),
        ).toBeEnabled(),
      );
    });

    it('shows the pins the commit dry run would write', async () => {
      await renderDialog({
        commit: true,
        committed: [
          {
            name: 'pr-review',
            path: 'pr-review',
            git: { url: REPO, commit: HEAD2 },
          },
          {
            name: 'incident',
            path: 'incident',
            git: { url: REPO, commit: HEAD },
          },
          { name: 'runbooks', oci: OCI },
        ],
      });

      const moving = await screen.findByTestId('skill-refresh-pr-review');
      expect(await within(moving).findByTitle(HEAD2)).toBeInTheDocument();
      expect(within(moving).queryByTitle(HEAD)).not.toBeInTheDocument();
    });
  });

  it('locks the confirm when every git skill is already at its head', async () => {
    await renderDialog({ refreshed: CURRENT });
    await screen.findByTestId('skill-refresh-pr-review');

    expect(
      await screen.findByText(
        "Every git skill is already at its repository's default-branch head.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Update all skills' }),
    ).toBeDisabled();
  });

  it("shows agent-manager's message for an unreachable repository and writes nothing", async () => {
    const { callTool } = await renderDialog({
      validateError: new Error(
        'invalid_request: invalid request: skills[0] (pr-review): unresolvable skill reference: head of the default branch of https://github.com/giantswarm/agent-skills could not be resolved: GitHub answered 404 — the repository does not exist, the ref is unknown, or the configured token cannot read it',
      ),
    });

    expect(
      await screen.findByText('agent-manager refuses to update the skills'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/GitHub answered 404 — the repository does not exist/),
    ).toBeInTheDocument();
    // No head will come: the row says so rather than looking pending.
    const row = screen.getByTestId('skill-refresh-pr-review');
    expect(row).not.toHaveTextContent('…');
    expect(within(row).queryAllByTestId('cell-skeleton')).toHaveLength(0);
    expect(
      screen.getByRole('button', { name: 'Update all skills' }),
    ).toBeDisabled();
    expect(
      callTool.mock.calls.some(
        ([tool]) => tool === 'x_agent-manager_update_agent',
      ),
    ).toBe(false);
  });

  it("shows agent-manager's refusal for a GitOps-owned agent verbatim", async () => {
    const message =
      'HelmRelease kagent/pr-reviewer is applied by Flux Kustomization "agents": its desired state lives in git, a live write would be undone. Change it in the GitOps repository, or pass force to write anyway';
    await renderDialog({ validateError: new Error(`conflict: ${message}`) });

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Update all skills' }),
    ).toBeDisabled();
  });

  it("shows the apiserver's Forbidden when a viewer confirms", async () => {
    await renderDialog({
      updateError: new Error(
        'forbidden: update HelmRelease kagent/pr-reviewer: helmreleases.helm.toolkit.fluxcd.io "pr-reviewer" is forbidden: User "oidc:viewer@lab.local" cannot update resource "helmreleases"',
      ),
    });
    await screen.findByTestId('skill-refresh-pr-review');
    const confirm = screen.getByRole('button', { name: 'Update all skills' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    expect(
      await screen.findByText(/User "oidc:viewer@lab.local" cannot update/),
    ).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
