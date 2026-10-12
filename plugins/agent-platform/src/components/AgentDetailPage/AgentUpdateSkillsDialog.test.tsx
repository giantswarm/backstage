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
  /** The dialog is open in commit mode: an agent applied from git. */
  commit?: boolean;
};

const OUTSIDE_DIRECTORY = new Error(
  "conflict: HelmRelease flux-giantswarm/pr-reviewer-agent is not in agent-manager's directory management-clusters/gazelle/extras/agent-manager of giantswarm/giantswarm-management-clusters (no management-clusters/gazelle/extras/agent-manager/pr-reviewer-agent.yaml there): change it in the file that defines it",
);

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
          return AGENT;
        case 'x_agent-manager_validate_agent':
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
            valid: true,
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
            if (scenario.commitDryRunError) {
              throw scenario.commitDryRunError;
            }
            return { ...committedTo(), dryRun: true };
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

function Host({ mode }: { mode?: 'apply' | 'commit' }) {
  const updating = useUpdateAgent('gazelle');
  return (
    <AgentUpdateSkillsDialog
      installation="gazelle"
      namespace="kagent"
      name="pr-reviewer"
      displayName="PR reviewer"
      isOpen
      mode={mode}
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
        <Host mode={scenario.commit ? 'commit' : 'apply'} />
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

    const digest = screen.getByTestId('skill-refresh-runbooks');
    expect(digest).toHaveTextContent('Pinned by digest — left alone');
    expect(digest).toHaveTextContent('n/a');
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
      expect(within(moving).getByTitle(HEAD)).toBeInTheDocument();
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
        await screen.findByRole('link', { name: /Open the pull request/ }),
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
      expect(
        screen.getAllByRole('button', { name: 'Close' }).length,
      ).toBeGreaterThan(0);
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

    it("says where to update the skills, and offers no pull request, for a release outside agent-manager's directory", async () => {
      const { callTool } = await renderDialog({
        commit: true,
        commitDryRunError: OUTSIDE_DIRECTORY,
      });

      expect(
        await screen.findByText('Update these skills in the GitOps repository'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('flux-giantswarm/pr-reviewer-agent'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('management-clusters/gazelle/extras/agent-manager'),
      ).toBeInTheDocument();
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
        screen.getByRole('button', { name: 'Open pull request' }),
      ).toBeDisabled();
      expect(
        callTool.mock.calls.some(
          ([tool, args]) =>
            tool === 'x_agent-manager_update_agent' && !args.dryRun,
        ),
      ).toBe(false);
    });

    it('says the same when only the pull request is refused that way', async () => {
      await renderDialog({ commit: true, commitError: OUTSIDE_DIRECTORY });
      await screen.findByTestId('skill-refresh-pr-review');
      const confirm = screen.getByRole('button', { name: 'Open pull request' });
      await waitFor(() => expect(confirm).toBeEnabled());
      await userEvent.click(confirm);

      expect(
        await screen.findByText('Update these skills in the GitOps repository'),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/is not in agent-manager's directory/),
      ).not.toBeInTheDocument();
      expect(confirm).toBeDisabled();
      expect(analyticsApi.captureEvent).not.toHaveBeenCalled();
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
