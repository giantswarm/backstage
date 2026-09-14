import { renderInTestApp } from '@backstage/frontend-test-utils';
import { TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import { useUpdateAgent } from '../../hooks/useUpdateAgent';
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
};

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

const onUpdated = jest.fn();
const onOpenChange = jest.fn();

function Host() {
  const updating = useUpdateAgent('gazelle');
  return (
    <AgentUpdateSkillsDialog
      installation="gazelle"
      namespace="kagent"
      name="pr-reviewer"
      displayName="PR reviewer"
      isOpen
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
    <TestApiProvider apis={[[musterApiRef, api]]}>
      <QueryClientProvider client={queryClient}>
        <Host />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

beforeEach(() => {
  onUpdated.mockReset();
  onOpenChange.mockReset();
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

    const confirm = screen.getByRole('button', { name: 'Update skills' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    await waitFor(() => {
      expect(onUpdated).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: 'pr-review' }),
        ]),
        'admin@lab.local',
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
      screen.getByRole('button', { name: 'Update skills' }),
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
      screen.getByRole('button', { name: 'Update skills' }),
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
      screen.getByRole('button', { name: 'Update skills' }),
    ).toBeDisabled();
  });

  it("shows the apiserver's Forbidden when a viewer confirms", async () => {
    await renderDialog({
      updateError: new Error(
        'forbidden: update HelmRelease kagent/pr-reviewer: helmreleases.helm.toolkit.fluxcd.io "pr-reviewer" is forbidden: User "oidc:viewer@lab.local" cannot update resource "helmreleases"',
      ),
    });
    await screen.findByTestId('skill-refresh-pr-review');
    const confirm = screen.getByRole('button', { name: 'Update skills' });
    await waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);

    expect(
      await screen.findByText(/User "oidc:viewer@lab.local" cannot update/),
    ).toBeInTheDocument();
    expect(onUpdated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
