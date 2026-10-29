import { renderInTestApp } from '@backstage/frontend-test-utils';
import { analyticsApiRef } from '@backstage/core-plugin-api';
import { mockApis, TestApiProvider } from '@backstage/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  musterApiRef,
  type MusterApi,
} from '@giantswarm/backstage-plugin-muster';

import type { AgentManagerAgent } from '../../lib/agentManager';
import type { AgentRow } from '../AgentsDataProvider';
import {
  SkillUpdateAgentsDialog,
  updateVerdictOf,
  type BehindAgent,
} from './SkillUpdateAgentsDialog';

const HEAD = '9f2c1a7e0b4d6c8a2e1f3b5d7c9a1b3d5e7f9a1b';
const OLD = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';
const PR = 'https://github.com/giantswarm/gitops/pull/42';

/** A portal without the muster plugin, when true. */
let mockIsUnavailable = false;
jest.mock('../../hooks/useAgentManager', () => ({
  ...jest.requireActual('../../hooks/useAgentManager'),
  useAgentManagerAvailability: () => ({
    available: [],
    missing: [],
    presenceOf: () => 'available',
    isLoading: false,
    isUnavailable: mockIsUnavailable,
  }),
}));

/** Namespaces in which the person may not update HelmReleases. */
let mockDeniedNamespaces = new Set<string>();
jest.mock('@giantswarm/backstage-plugin-kubernetes-react', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-kubernetes-react'),
  useSelfSubjectAccessReview: (
    _cluster: string,
    attributes: { namespace?: string },
  ) => ({
    allowed: !mockDeniedNamespaces.has(attributes.namespace ?? ''),
    isLoading: false,
  }),
}));

function row(technicalName: string, namespace = 'kagent'): AgentRow {
  return {
    id: `gazelle/${namespace}/${technicalName}`,
    installation: 'gazelle',
    namespace,
    name: technicalName,
    technicalName,
    description: '',
    skillCount: 1,
    readiness: 'ready',
  };
}

const behind = (...rows: AgentRow[]): BehindAgent[] =>
  rows.map(r => ({ row: r, pinned: OLD }));

type Scenario = {
  /** Technical names of agents applied from git. */
  gitops?: string[];
  canCommit?: boolean;
  /** Holds every agent read until it settles, to see the rows still checked. */
  heldReads?: Promise<void>;
};

function makeMusterApi({
  gitops = [],
  canCommit = true,
  heldReads,
}: Scenario = {}) {
  const callTool = jest.fn(
    async (tool: string, args: Record<string, unknown>) => {
      switch (tool) {
        case 'x_agent-manager_get_info':
          return { capabilities: { commit: canCommit } };
        case 'x_agent-manager_get_agent': {
          await heldReads;
          const name = String(args.name);
          return {
            name,
            namespace: args.namespace,
            exists: true,
            ready: true,
            managed: gitops.includes(name) ? 'gitops' : 'helmrelease',
            helmRelease: { name, namespace: args.namespace, ready: true },
          } as AgentManagerAgent;
        }
        case 'x_agent-manager_get_agent_status':
          return { agent: { generation: 1 } };
        case 'x_agent-manager_update_agent':
          if (args.mode === 'commit') {
            return { mode: 'commit', commit: { pullRequest: PR } };
          }
          return {
            agent: { name: args.name, namespace: args.namespace },
            before: {},
            after: {},
            changed: ['skills'],
            manifests: { ociRepository: '', helmRelease: '', values: {} },
          };
        default:
          throw new Error(`unexpected tool ${tool}`);
      }
    },
  );
  return { api: { callTool } as unknown as MusterApi, callTool };
}

const analyticsApi = mockApis.analytics.mock();
const onOpenChange = jest.fn();

async function renderDialog(agents: BehindAgent[], scenario: Scenario = {}) {
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
        <SkillUpdateAgentsDialog
          skillName="Ticket triage"
          head={HEAD}
          behind={agents}
          isOpen
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>
    </TestApiProvider>,
  );
  return { callTool };
}

function writes(callTool: jest.Mock) {
  return callTool.mock.calls
    .filter(([tool]) => tool === 'x_agent-manager_update_agent')
    .map(([, args]) => args);
}

async function confirmButton(name: RegExp | string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

beforeEach(() => {
  mockDeniedNamespaces = new Set();
  mockIsUnavailable = false;
  onOpenChange.mockReset();
  jest.mocked(analyticsApi.captureEvent).mockClear();
});

describe('SkillUpdateAgentsDialog', () => {
  it('lists every agent behind with old → new commits, all selected, and updates each with refreshSkills', async () => {
    const { callTool } = await renderDialog(
      behind(row('triage-bot'), row('support-bot')),
    );

    const line = screen.getByTestId('behind-agent-gazelle/kagent/triage-bot');
    expect(within(line).getByTitle(OLD)).toHaveTextContent(OLD.slice(0, 7));
    expect(within(line).getByTitle(HEAD)).toHaveTextContent(HEAD.slice(0, 7));
    // The refresh moves every git skill of the agent; the dialog says so.
    expect(
      screen.getByText(/re-pins every git skill it mounts/),
    ).toBeInTheDocument();

    await userEvent.click(await confirmButton('Update 2 agents'));

    expect(await screen.findByText('2 agents updated.')).toBeInTheDocument();
    expect(writes(callTool)).toEqual(
      expect.arrayContaining([
        { namespace: 'kagent', name: 'triage-bot', refreshSkills: true },
        { namespace: 'kagent', name: 'support-bot', refreshSkills: true },
      ]),
    );
    expect(writes(callTool)).toHaveLength(2);
    // The hook's own event, once per agent — no new event.
    expect(analyticsApi.captureEvent).toHaveBeenCalledTimes(2);
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.agentUpdated',
        attributes: { mode: 'apply', change: 'skillsRefreshed' },
      }),
    );
    // Done: only Close is left.
    expect(
      screen.queryByRole('button', { name: /Update \d agent/ }),
    ).not.toBeInTheDocument();
  });

  it('lays a row still being checked out as the updatable row it becomes', async () => {
    let release = () => {};
    const heldReads = new Promise<void>(resolve => {
      release = resolve;
    });
    await renderDialog(behind(row('alpha-bot'), row('beta-bot')), {
      heldReads,
    });

    // No visible note under a row being checked — the box says it to screen
    // readers — and the select-all box is there from the start, so neither
    // moves the list when the verdicts arrive.
    const line = screen.getByTestId('behind-agent-gazelle/kagent/alpha-bot');
    const box = within(line).getByRole('checkbox', { name: 'alpha-bot' });
    expect(box).toBeDisabled();
    expect(box).toHaveAccessibleDescription(
      'Checking whether you can update it…',
    );
    const shownText = (element: HTMLElement) =>
      within(element)
        .queryAllByText(/./)
        .filter(text => !text.closest('.bui-VisuallyHidden'))
        .map(text => text.textContent)
        .join('|');
    const checkingText = shownText(line);
    expect(
      screen.getByRole('checkbox', { name: 'All agents you can update (0)' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Checking which agents you can update…'),
    ).toBeInTheDocument();

    release();
    await confirmButton('Update 2 agents');
    expect(shownText(line)).toBe(checkingText);
    expect(box).toBeEnabled();
    expect(box).not.toHaveAccessibleDescription();
    expect(
      screen.getByRole('checkbox', { name: 'All agents you can update (2)' }),
    ).toBeEnabled();
    expect(
      screen.queryByText('Checking which agents you can update…'),
    ).not.toBeInTheDocument();
  });

  it('shows a row blocked for want of agent-manager with its reason from the first render', async () => {
    mockIsUnavailable = true;
    // Every change to the page while it renders and settles: a row that gains
    // or loses content, or anything taken away, would be a jump.
    const records: MutationRecord[] = [];
    const observer = new MutationObserver(batch => records.push(...batch));
    observer.observe(document.body, { childList: true, subtree: true });
    await renderDialog(behind(row('alpha-bot'), row('beta-bot')));
    await screen.findAllByText(/this portal has no muster plugin/);
    records.push(...observer.takeRecords());
    observer.disconnect();

    const isInRow = (node: Node) =>
      node instanceof Element &&
      node.closest('[data-testid^="behind-agent-"]') !== null;
    expect(records.filter(record => isInRow(record.target))).toEqual([]);
    const removedText = records
      .flatMap(record => [...record.removedNodes])
      .map(node => node.textContent ?? '')
      .join('|');
    expect(removedText).not.toMatch(/All agents you can update/);
    expect(
      screen.queryByRole('checkbox', { name: /All agents you can update/ }),
    ).not.toBeInTheDocument();
  });

  it('keeps the select-all box once shown when the checks leave one agent to update', async () => {
    mockDeniedNamespaces = new Set(['locked']);
    await renderDialog(behind(row('alpha-bot'), row('beta-bot', 'locked')));

    await confirmButton('Update 1 agent');
    expect(
      screen.getByRole('checkbox', { name: 'All agents you can update (1)' }),
    ).toBeEnabled();
  });

  it('updates only the agents left selected', async () => {
    const { callTool } = await renderDialog(
      behind(row('alpha-bot'), row('beta-bot'), row('gamma-bot')),
    );
    await confirmButton('Update 3 agents');

    await userEvent.click(screen.getByRole('checkbox', { name: 'beta-bot' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'gamma-bot' }));
    expect(
      screen.getByRole('checkbox', { name: 'All agents you can update (3)' }),
    ).not.toBeChecked();

    await userEvent.click(await confirmButton('Update 1 agent'));

    expect(await screen.findByText('1 agent updated.')).toBeInTheDocument();
    expect(writes(callTool)).toEqual([
      { namespace: 'kagent', name: 'alpha-bot', refreshSkills: true },
    ]);
  });

  it('selects none and all again from the select-all box', async () => {
    await renderDialog(behind(row('alpha-bot'), row('beta-bot')));
    await confirmButton('Update 2 agents');
    const all = screen.getByRole('checkbox', {
      name: 'All agents you can update (2)',
    });

    await userEvent.click(all);
    // Pressable with nothing selected: it says so under the list and puts the
    // focus on the select-all box, and updates nothing.
    await userEvent.click(
      screen.getByRole('button', { name: 'Update agents' }),
    );
    expect(
      screen.getByText('Choose at least one agent to update.'),
    ).toBeInTheDocument();
    expect(all).toHaveFocus();

    await userEvent.click(all);
    expect(await confirmButton('Update 2 agents')).toBeEnabled();
    expect(
      screen.queryByText('Choose at least one agent to update.'),
    ).not.toBeInTheDocument();
  });

  it('proposes a pull request for an agent applied from git and writes the others live', async () => {
    const { callTool } = await renderDialog(
      behind(row('live-bot'), row('git-bot')),
      { gitops: ['git-bot'] },
    );

    const gitLine = await screen.findByTestId(
      'behind-agent-gazelle/kagent/git-bot',
    );
    await waitFor(() =>
      expect(gitLine).toHaveTextContent(
        'updated through a pull request in its GitOps repository',
      ),
    );
    expect(
      screen.getByText(/One selected agent is applied from git/),
    ).toBeInTheDocument();

    await userEvent.click(await confirmButton('Update 2 agents'));

    expect(
      await screen.findByText('1 agent updated, 1 pull request opened.'),
    ).toBeInTheDocument();
    expect(within(gitLine).getByRole('link', { name: PR })).toHaveAttribute(
      'href',
      PR,
    );
    expect(writes(callTool)).toEqual(
      expect.arrayContaining([
        { namespace: 'kagent', name: 'live-bot', refreshSkills: true },
        {
          namespace: 'kagent',
          name: 'git-bot',
          refreshSkills: true,
          mode: 'commit',
        },
      ]),
    );
    expect(analyticsApi.captureEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'AgentPlatform.agentUpdated',
        attributes: { mode: 'commit', change: 'skillsRefreshed' },
      }),
    );
  });

  it('lists an agent applied from git as not updatable when agent-manager cannot open pull requests', async () => {
    await renderDialog(behind(row('live-bot'), row('git-bot')), {
      gitops: ['git-bot'],
      canCommit: false,
    });

    const gitLine = await screen.findByTestId(
      'behind-agent-gazelle/kagent/git-bot',
    );
    await waitFor(() =>
      expect(gitLine).toHaveTextContent(/cannot open pull requests/),
    );
    expect(within(gitLine).getByRole('checkbox')).toBeDisabled();
    expect(await confirmButton('Update 1 agent')).toBeEnabled();
  });

  it('lists an agent the person may not update disabled, with the reason, and never writes it', async () => {
    mockDeniedNamespaces = new Set(['restricted']);
    const { callTool } = await renderDialog(
      behind(row('open-bot'), row('locked-bot', 'restricted')),
    );

    const locked = await screen.findByTestId(
      'behind-agent-gazelle/restricted/locked-bot',
    );
    await waitFor(() =>
      expect(locked).toHaveTextContent(
        'You may not update agents in restricted on gazelle.',
      ),
    );
    const box = within(locked).getByRole('checkbox', { name: 'locked-bot' });
    expect(box).toBeDisabled();
    expect(box).not.toBeChecked();

    await userEvent.click(await confirmButton('Update 1 agent'));

    expect(await screen.findByText('1 agent updated.')).toBeInTheDocument();
    expect(writes(callTool)).toEqual([
      { namespace: 'kagent', name: 'open-bot', refreshSkills: true },
    ]);
  });
});

describe('updateVerdictOf', () => {
  const base = {
    installation: 'gazelle',
    namespace: 'kagent',
    isUnavailable: false,
    presence: 'available' as const,
    isPresenceLoading: false,
    read: { agent: undefined, isLoading: false },
    canCommit: false,
    isInfoLoading: false,
    mayUpdate: true,
    isCheckingPermission: false,
  };

  it('blocks without muster or agent-manager, and asks to connect a session', () => {
    expect(updateVerdictOf({ ...base, isUnavailable: true }).kind).toBe(
      'blocked',
    );
    expect(updateVerdictOf({ ...base, presence: 'missing' })).toEqual({
      kind: 'blocked',
      reason: 'Muster on gazelle lists no agent-manager.',
    });
    expect(updateVerdictOf({ ...base, presence: 'sharedIdentity' })).toEqual({
      kind: 'blocked',
      reason: expect.stringContaining(
        "Muster on gazelle has no per-user sign-in in this portal, so agent-manager would act under muster's shared identity",
      ),
    });
    expect(
      updateVerdictOf({
        ...base,
        read: {
          agent: undefined,
          isLoading: false,
          failure: { kind: 'not-connected', message: 'sign in first' },
        },
      }),
    ).toMatchObject({ kind: 'blocked', connect: 'sign in first' });
  });

  it('keeps checking while anything it needs is still being read', () => {
    expect(
      updateVerdictOf({
        ...base,
        presence: 'unknown',
        isPresenceLoading: true,
      }),
    ).toEqual({ kind: 'checking' });
    expect(
      updateVerdictOf({
        ...base,
        read: { agent: undefined, isLoading: true },
      }),
    ).toEqual({ kind: 'checking' });
    expect(updateVerdictOf({ ...base, isCheckingPermission: true })).toEqual({
      kind: 'checking',
    });
  });

  it('offers a live write when a read failed in another way, as Agent detail does', () => {
    expect(
      updateVerdictOf({
        ...base,
        read: {
          agent: undefined,
          isLoading: false,
          failure: { kind: 'error', message: 'boom' },
        },
      }),
    ).toEqual({ kind: 'apply' });
  });
});
