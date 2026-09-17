import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import {
  InventoryRecord,
  RepositoriesApi,
  repositoriesApiRef,
} from '../../apis';
import { unusedWrites } from '../../fixtures/fakeApi';
import {
  committedOf,
  dispatchOf,
  planOf,
  presentService,
  strayTool,
} from '../../fixtures/records';
import {
  RepositoriesProviders,
  repositoriesQueryClient,
} from '../RepositoriesProviders';
import { parseEntry } from './dialogs';
import { RowActions } from './RowActions';

const APPLY_REFUSAL =
  'mode "apply" is refused: a repository without its declaration is drift the reconciler reports. Use mode "commit" (a team-file pull request opened as you) or dryRun: true for the rendered change';

type Writes = Pick<
  RepositoriesApi,
  | 'updateRepository'
  | 'transferRepository'
  | 'setLifecycle'
  | 'reconcileRepository'
  | 'decideRepository'
>;

function renderActions(
  writes: Partial<Writes>,
  record: InventoryRecord = presentService,
  onChanged = jest.fn(),
) {
  const api = {
    ...unusedWrites,
    ...writes,
  } as unknown as RepositoriesApi;
  render(
    <TestApiProvider apis={[[repositoriesApiRef, api]]}>
      <RepositoriesProviders>
        <RowActions record={record} onChanged={onChanged} />
      </RepositoriesProviders>
    </TestApiProvider>,
  );
  return { onChanged };
}

const dialog = (name: RegExp) => screen.getByRole('form', { name });
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => repositoriesQueryClient.clear());

describe('parseEntry', () => {
  it('reads the one item of the team-file list, or nothing', () => {
    expect(
      parseEntry('- name: present-service\n  componentType: service\n'),
    ).toEqual({ name: 'present-service', componentType: 'service' });
    expect(parseEntry('name: x\ngen: {language: go}\n')).toEqual({
      name: 'x',
      gen: { language: 'go' },
    });
    expect(parseEntry('- componentType: service\n')).toBeUndefined();
    expect(parseEntry('- [')).toBeUndefined();
  });
});

describe('RowActions', () => {
  it('offers only Reconcile now and Keep for an undeclared repository', () => {
    renderActions({}, strayTool);
    for (const name of ['Configure', 'Transfer', 'Deprecate', 'Archive']) {
      expect(button(name)).toBeDisabled();
    }
    expect(button('Reconcile now')).toBeEnabled();
    expect(button('Keep')).toBeEnabled();
  });

  it('Archive: shows what it does and the review notice, the plan with its ask, then the pull request', async () => {
    const setLifecycle = jest
      .fn()
      .mockResolvedValueOnce(planOf())
      .mockResolvedValueOnce(committedOf());
    const { onChanged } = renderActions({ setLifecycle });
    await userEvent.click(button('Archive'));

    const form = dialog(/^Archive present-service/);
    expect(form).toHaveTextContent(
      'archives the repository on GitHub and unfollows it on CircleCI',
    );
    expect(form).toHaveTextContent(
      "the ask goes to team-bumblebee's channel, where a member's Approve",
    );
    await userEvent.type(within(form).getByLabelText(/^Reason/), 'done');
    await userEvent.click(button('Review'));
    expect(setLifecycle).toHaveBeenCalledWith(
      'giantswarm/present-service',
      { lifecycle: 'archived', reason: 'done' },
      { dryRun: true },
    );

    const plan = await screen.findByTestId('plan');
    expect(plan).toHaveTextContent(
      'giantswarm/present-service (team-bumblebee) — accepted',
    );
    expect(within(plan).getByTestId('entry-after')).toHaveTextContent(
      'lifecycle: archived',
    );
    expect(within(plan).getByTestId('planned-pull-request')).toHaveTextContent(
      'Pull request on giantswarm/github as alice',
    );
    expect(plan).toHaveTextContent(
      'Approval asked to #team-bumblebee (team-bumblebee)',
    );
    expect(plan).toHaveTextContent('Approve lands it');

    await userEvent.click(button('Open pull request'));
    expect(setLifecycle).toHaveBeenLastCalledWith(
      'giantswarm/present-service',
      { lifecycle: 'archived', reason: 'done' },
      { mode: 'commit' },
    );
    const opened = await screen.findByTestId('pull-request-opened');
    expect(opened).toHaveTextContent(
      '#4243 chore(repositories): archive present-service',
    );
    expect(opened).toHaveTextContent(
      'The ask posted to #team-bumblebee (team-bumblebee).',
    );
    expect(
      within(opened).getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/github/pull/4243');
    expect(
      screen.getByText('Pull request opened as alice'),
    ).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    // Done: Cancel became Close (the dialog's own X is a Close as well).
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(
      screen.getAllByRole('button', { name: 'Close' }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).toBeNull();
  });

  it('Deprecate: names its effect and sets lifecycle deprecated', async () => {
    const setLifecycle = jest
      .fn()
      .mockResolvedValue(
        planOf({ entry: '- name: present-service\n  lifecycle: deprecated\n' }),
      );
    renderActions({ setLifecycle });
    await userEvent.click(button('Deprecate'));
    expect(dialog(/^Deprecate present-service/)).toHaveTextContent(
      'security-only Renovate updates and a deprecated flag on the catalog entity',
    );
    await userEvent.click(button('Review'));
    expect(setLifecycle).toHaveBeenCalledWith(
      'giantswarm/present-service',
      { lifecycle: 'deprecated', reason: undefined },
      { dryRun: true },
    );
    expect(await screen.findByTestId('entry-after')).toHaveTextContent(
      'lifecycle: deprecated',
    );
  });

  it('Transfer: says who gives and who takes and that the receiving team approves', async () => {
    const transferRepository = jest.fn().mockResolvedValue(
      planOf({
        team: 'team-planeteers',
        fromTeam: 'team-bumblebee',
        ask: {
          team: 'team-planeteers',
          channel: '#team-planeteers',
          text: 'alice asks team-planeteers to take giantswarm/present-service',
          deliverable: true,
        },
        notice: {
          team: 'team-bumblebee',
          text: 'giantswarm/present-service moves to team-planeteers',
          deliverable: false,
          reason: 'no channel configured',
        },
      }),
    );
    renderActions({ transferRepository });
    await userEvent.click(button('Transfer'));
    const form = dialog(/^Transfer present-service/);
    expect(form).toHaveTextContent(
      'team-bumblebee gives giantswarm/present-service; the team named below takes it.',
    );
    expect(form).toHaveTextContent(
      "receiving team's channel and its member approves",
    );
    expect(button('Review')).toBeDisabled();
    await userEvent.type(
      within(form).getByLabelText(/^Receiving team/),
      'team-planeteers',
    );
    await userEvent.click(button('Review'));
    expect(transferRepository).toHaveBeenCalledWith(
      'giantswarm/present-service',
      { toTeam: 'team-planeteers', reason: undefined },
      { dryRun: true },
    );
    const plan = await screen.findByTestId('plan');
    expect(plan).toHaveTextContent(
      'giantswarm/present-service: from team-bumblebee to team-planeteers',
    );
    expect(plan).toHaveTextContent(
      'Approval asked to #team-planeteers (team-planeteers)',
    );
    expect(plan).toHaveTextContent('Notice to team-bumblebee');
    expect(plan).toHaveTextContent(
      'Cannot be delivered: no channel configured',
    );
  });

  it('Configure: sends the edited entry whole and shows the schema refusal as data', async () => {
    const updateRepository = jest.fn().mockResolvedValue(
      planOf({
        accepted: false,
        problems: [
          {
            field: 'gen.flavours[0]',
            message: 'value must be one of "app", "cli", …',
          },
        ],
        entry: '- name: present-service\n  gen:\n    flavours:\n      - nope\n',
      }),
    );
    renderActions({ updateRepository });
    await userEvent.click(button('Configure'));
    const form = dialog(/^Configure present-service/);
    const entry = within(form).getByLabelText(/^Entry/);
    expect(entry).toHaveValue(presentService.declaration!.entry);
    await userEvent.clear(entry);
    // user-event: `{{` and `[[` type the literal brace and bracket.
    await userEvent.type(
      entry,
      '- name: present-service{enter}  gen: {{flavours: [[nope]}',
    );
    await userEvent.click(button('Review'));
    expect(updateRepository).toHaveBeenCalledWith(
      'giantswarm/present-service',
      {
        entry: { name: 'present-service', gen: { flavours: ['nope'] } },
        reason: undefined,
      },
      { dryRun: true },
    );
    const plan = await screen.findByTestId('plan');
    expect(plan).toHaveTextContent('— refused');
    expect(within(plan).getByTestId('problems')).toHaveTextContent(
      'gen.flavours[0]: value must be one of',
    );
    // The manager's verdict is shown; the button stays the manager's to refuse.
    expect(button('Open pull request')).toBeEnabled();
  });

  it('Configure: an entry that is not YAML disables Review and says so', async () => {
    renderActions({});
    await userEvent.click(button('Configure'));
    const entry = within(dialog(/^Configure/)).getByLabelText(/^Entry/);
    await userEvent.clear(entry);
    await userEvent.type(entry, '- [[');
    expect(button('Review')).toBeDisabled();
    expect(screen.getByText(/Not a team-file entry yet/)).toBeInTheDocument();
  });

  it("shows the manager's refusal verbatim and offers no override", async () => {
    const setLifecycle = jest.fn().mockRejectedValue(new Error(APPLY_REFUSAL));
    renderActions({ setLifecycle });
    await userEvent.click(button('Archive'));
    await userEvent.click(button('Review'));
    expect(
      await screen.findByText('giantswarm-repo-manager refused'),
    ).toBeInTheDocument();
    expect(screen.getByText(APPLY_REFUSAL)).toBeInTheDocument();
    // The form stays; Review and Cancel are the only buttons.
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(
      expect.arrayContaining(['Cancel', 'Review']),
    );
    expect(
      screen.queryByRole('button', { name: /force|override|apply/i }),
    ).toBeNull();
    expect(screen.queryByTestId('plan')).toBeNull();
  });

  it('Reconcile now: the planned dispatch, then the dispatch as the person with the runs link', async () => {
    const reconcileRepository = jest
      .fn()
      .mockResolvedValueOnce(dispatchOf(false))
      .mockResolvedValueOnce(dispatchOf(true));
    const { onChanged } = renderActions({ reconcileRepository });
    await userEvent.click(button('Reconcile now'));
    expect(dialog(/^Reconcile present-service now/)).toHaveTextContent(
      'Declared by team-bumblebee.',
    );
    await userEvent.click(button('Review'));
    expect(reconcileRepository).toHaveBeenCalledWith(
      'giantswarm/present-service',
      { team: undefined },
      { dryRun: true },
    );
    expect(
      await screen.findByText(
        'Would dispatch reconcile-repositories.yaml as alice',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dispatch')).toHaveTextContent(
      'Inputs: repository=present-service, team=team-bumblebee',
    );
    await userEvent.click(button('Reconcile now'));
    expect(reconcileRepository).toHaveBeenLastCalledWith(
      'giantswarm/present-service',
      { team: undefined },
      { mode: 'commit' },
    );
    expect(
      await screen.findByText(
        'Dispatched reconcile-repositories.yaml as alice',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Workflow runs/ })).toHaveAttribute(
      'href',
      dispatchOf(true).runsUrl,
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it('Reconcile now on an undeclared repository needs the team', async () => {
    const reconcileRepository = jest.fn().mockResolvedValue(dispatchOf(false));
    renderActions({ reconcileRepository }, strayTool);
    await userEvent.click(button('Reconcile now'));
    expect(button('Review')).toBeDisabled();
    await userEvent.type(
      within(dialog(/^Reconcile stray-tool now/)).getByLabelText(/^Team/),
      'team-planeteers',
    );
    await userEvent.click(button('Review'));
    expect(reconcileRepository).toHaveBeenCalledWith(
      'giantswarm/stray-tool',
      { team: 'team-planeteers' },
      { dryRun: true },
    );
  });

  it('Keep: records the decision with the note, no dry run', async () => {
    const decideRepository = jest.fn().mockResolvedValue({
      ...strayTool,
      decision: {
        verdict: 'keep',
        note: 'still used by support',
        by: 'alice',
        at: '2026-09-17T10:00:00Z',
      },
    });
    const { onChanged } = renderActions({ decideRepository }, strayTool);
    await userEvent.click(button('Keep'));
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    await userEvent.type(
      within(dialog(/^Keep stray-tool/)).getByLabelText(/^Note/),
      'still used by support',
    );
    await userEvent.click(button('Keep'));
    expect(decideRepository).toHaveBeenCalledWith('giantswarm/stray-tool', {
      verdict: 'keep',
      note: 'still used by support',
    });
    expect(
      await screen.findByText('Decision recorded: keep'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('By alice — still used by support.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
