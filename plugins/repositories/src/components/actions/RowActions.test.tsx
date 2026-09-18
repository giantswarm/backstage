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
  alignmentOf,
  committedOf,
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
  | 'alignRepository'
  | 'getRepository'
>;

function renderActions(
  writes: Partial<Writes>,
  record: InventoryRecord = presentService,
  onChanged = jest.fn(),
) {
  const api = {
    ...unusedWrites,
    // The record as an Align now follows it: unchanged unless a test says.
    getRepository: async () => record,
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

/** present-service with its entry as the team file holds one. */
const withEntry = (entry: string): InventoryRecord => ({
  ...presentService,
  declaration: { ...presentService.declaration!, entry },
});

/** The Go service: the form's fields, and fields the form does not carry at two levels. */
const declaredService = withEntry(
  [
    '- name: present-service',
    '  componentType: service',
    '  system: agent-platform',
    '  lifecycle: production',
    '  gen:',
    '    language: go',
    '    flavours:',
    '      - app',
    '    ci:',
    '      generate: true',
    '      appCatalog: giantswarm',
    '',
  ].join('\n'),
);

/** A CLI in Python: devctl's Makefile generator builds a CLI for Go only. */
const pythonCli = withEntry(
  '- name: present-service\n  componentType: cli\n  gen:\n    language: python\n    flavours:\n      - cli\n',
);

/** An entry the page cannot read as YAML. */
const unreadable = withEntry('- [');

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
  it('offers only Align now for an undeclared repository', () => {
    renderActions({}, strayTool);
    for (const name of ['Edit', 'Transfer', 'Deprecate', 'Archive', 'Delete']) {
      expect(button(name)).toBeDisabled();
    }
    expect(button('Align now')).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Keep' })).toBeNull();
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

  it('Delete: stands apart from the group, needs the repository name typed, sends it as confirm, then the plan and the pull request', async () => {
    const setLifecycle = jest
      .fn()
      .mockResolvedValueOnce(
        planOf({
          entry:
            '- name: present-service\n  componentType: service\n  lifecycle: deleted\n  align: true\n',
          pullRequest: {
            ...planOf().pullRequest,
            branch: 'reposetup/deleted-present-service',
            title:
              'chore(repositories): delete present-service (team-bumblebee)',
          },
        }),
      )
      .mockResolvedValueOnce(committedOf());
    const { onChanged } = renderActions({ setLifecycle });
    const del = button('Delete');
    // Apart from the ButtonGroup: the one action after which the repository is gone.
    expect(del.closest('[role="group"]')).toBeNull();
    await userEvent.click(del);

    const form = dialog(/^Delete present-service/);
    expect(form).toHaveTextContent(
      'unfollows the repository on CircleCI and deletes it on GitHub',
    );
    expect(form).toHaveTextContent(
      'The entry stays in the team file as the record of the deletion.',
    );
    expect(button('Review')).toBeDisabled();
    const name = within(form).getByLabelText(/^Repository name/);
    await userEvent.type(name, 'other-service');
    expect(button('Review')).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'giantswarm/Present-Service');
    await userEvent.type(within(form).getByLabelText(/^Reason/), 'retired');
    await userEvent.click(button('Review'));
    expect(setLifecycle).toHaveBeenCalledWith(
      'giantswarm/present-service',
      {
        lifecycle: 'deleted',
        reason: 'retired',
        confirm: 'giantswarm/Present-Service',
      },
      { dryRun: true },
    );
    const plan = await screen.findByTestId('plan');
    expect(within(plan).getByTestId('entry-after')).toHaveTextContent(
      'lifecycle: deleted',
    );
    expect(within(plan).getByTestId('planned-pull-request')).toHaveTextContent(
      'chore(repositories): delete present-service',
    );

    await userEvent.click(button('Open pull request'));
    expect(setLifecycle).toHaveBeenLastCalledWith(
      'giantswarm/present-service',
      {
        lifecycle: 'deleted',
        reason: 'retired',
        confirm: 'giantswarm/Present-Service',
      },
      { mode: 'commit' },
    );
    await screen.findByTestId('pull-request-opened');
    expect(onChanged).toHaveBeenCalled();
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

  it('Edit: opens on the entry as the Create form shows it, sends it whole with the fields the form does not carry kept, and shows the schema refusal as data', async () => {
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
    renderActions({ updateRepository }, declaredService);
    await userEvent.click(button('Edit'));
    const form = dialog(/^Edit present-service/);
    expect(form).toHaveTextContent(
      'replaced by the declaration below, the fields as Create repository asks them',
    );
    // The entry's repository, team and file are fixed: no team choice, no
    // name field; the fields the form does not carry are named as kept.
    const existing = within(form).getByTestId('existing-entry');
    expect(existing).toHaveTextContent('giantswarm/present-service');
    expect(existing).toHaveTextContent(
      'Declared by team-bumblebee in repositories/team-bumblebee.yaml',
    );
    expect(within(form).getByTestId('kept-fields')).toHaveTextContent(
      'Kept as they are: system, lifecycle, gen.ci.appCatalog.',
    );
    expect(within(form).queryByLabelText(/^Name/)).toBeNull();
    expect(within(form).queryByRole('button', { name: /Team$/ })).toBeNull();
    // The entry as the Create form shows it: the preset it matches, the
    // declaration line, the visibility, the opt-in.
    expect(
      within(form).getByRole('radiogroup', { name: 'What is it?' }),
    ).toBeInTheDocument();
    expect(
      within(form).getByRole('radio', { name: /^Go service/ }),
    ).toBeChecked();
    expect(within(form).getByTestId('declaration-summary')).toHaveTextContent(
      'service · go · app · CircleCI config generated',
    );
    expect(within(form).getByRole('radio', { name: /^Private/ })).toBeChecked();
    const optIn = within(form).getByRole('checkbox', {
      name: 'Opted in to alignment',
    });
    expect(optIn).not.toBeChecked();

    await userEvent.type(
      within(form).getByLabelText(/^Description/),
      'Serves the present',
    );
    await userEvent.click(
      within(form).getByRole('radio', { name: /^Chart-only app/ }),
    );
    expect(within(form).getByTestId('declaration-summary')).toHaveTextContent(
      'service · generic · app · CircleCI config generated',
    );
    await userEvent.click(optIn);
    await userEvent.type(
      within(form).getByLabelText(/^Reason/),
      'built elsewhere now',
    );
    await userEvent.click(button('Review'));
    expect(updateRepository).toHaveBeenCalledWith(
      'giantswarm/present-service',
      {
        entry: {
          name: 'present-service',
          componentType: 'service',
          system: 'agent-platform',
          lifecycle: 'production',
          gen: {
            language: 'generic',
            flavours: ['app'],
            ci: { generate: true, appCatalog: 'giantswarm' },
          },
          description: 'Serves the present',
          align: true,
        },
        reason: 'built elsewhere now',
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

  it('Edit: an entry that breaks the generator’s rule opens the declaration’s controls and waits for the fix', async () => {
    renderActions({}, pythonCli);
    await userEvent.click(button('Edit'));
    const form = dialog(/^Edit present-service/);
    expect(within(form).getByTestId('declaration-summary')).toHaveTextContent(
      'cli · python · cli · CircleCI config not generated',
    );
    expect(within(form).getByTestId('declaration-source')).toHaveTextContent(
      'Adjusted by hand: no preset matches.',
    );
    // The controls opened by themselves: the rule is shown where it is fixed.
    expect(button('Done')).toHaveAttribute('aria-expanded', 'true');
    expect(within(form).getByTestId('flavour-check')).toHaveTextContent(
      'flavour cli is supported only for language go',
    );
    expect(button('Review')).toBeDisabled();

    await userEvent.click(within(form).getByRole('radio', { name: 'generic' }));
    expect(within(form).queryByTestId('flavour-check')).toBeNull();
    expect(button('Review')).toBeEnabled();
  });

  it('Edit: an entry that is not YAML says so and offers no Review', async () => {
    renderActions({}, unreadable);
    await userEvent.click(button('Edit'));
    const form = dialog(/^Edit present-service/);
    expect(form).toHaveTextContent(
      'The entry of present-service in repositories/team-bumblebee.yaml could not be read',
    );
    expect(within(form).queryByTestId('existing-entry')).toBeNull();
    expect(button('Review')).toBeDisabled();
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

  it('Align now, team opted in: what it changes, the warning, the planned changes per step, Align now, then the dispatch followed to the run’s report', async () => {
    const alignRepository = jest
      .fn()
      .mockResolvedValueOnce(alignmentOf(false))
      .mockResolvedValueOnce(alignmentOf(true));
    const dispatched: InventoryRecord = {
      ...presentService,
      setup: {
        ...presentService.setup,
        pendingRun: {
          dispatchedAt: new Date().toISOString(),
          by: 'alice',
          kind: 'dispatched',
        },
      },
    };
    const reported: InventoryRecord = {
      ...presentService,
      setup: {
        ...presentService.setup,
        lastRun: {
          ...presentService.setup.lastRun!,
          timestamp: new Date(Date.now() + 30_000).toISOString(),
          change: { kind: 'dispatched', by: 'alice' },
        },
      },
    };
    const getRepository = jest
      .fn()
      .mockResolvedValueOnce(dispatched)
      .mockResolvedValue(reported);
    const { onChanged } = renderActions({ alignRepository, getRepository });
    await userEvent.click(button('Align now'));
    const form = dialog(/^Align present-service now/);
    expect(form).toHaveTextContent(
      'Changes giantswarm/present-service on GitHub and CircleCI to its declared set-up and the company baseline',
    );
    expect(form).toHaveTextContent(
      'as you, by dispatching the set-up workflow',
    );
    expect(form).toHaveTextContent('Declared by team-bumblebee.');
    await userEvent.click(button('Review'));
    expect(alignRepository).toHaveBeenCalledWith(
      'giantswarm/present-service',
      { team: undefined },
      { dryRun: true },
    );

    const alignment = await screen.findByTestId('alignment');
    expect(
      within(alignment).getByTestId('alignment-warning'),
    ).toHaveTextContent(alignmentOf(false).warning);
    expect(within(alignment).getByTestId('opt-in')).toHaveTextContent(
      'team-bumblebee has opted in: the changes below are applied.',
    );
    const planned = within(alignment).getByTestId('planned');
    expect(planned).toHaveTextContent(
      'Planned changes. Checked at 2026-09-17T21:00:00Z.',
    );
    expect(planned).toHaveTextContent('protection');
    expect(planned).toHaveTextContent(
      'main: require the ci/circleci: build status check',
    );
    expect(planned).toHaveTextContent('main: enforce for administrators');
    expect(planned).toHaveTextContent('circleci');
    expect(planned).toHaveTextContent('follow the project');
    expect(
      screen.getByText('Would dispatch reconcile-repositories.yaml as alice'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('dispatch')).toHaveTextContent(
      'Inputs: repository=present-service, team=team-bumblebee',
    );
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();

    await userEvent.click(button('Align now'));
    expect(alignRepository).toHaveBeenLastCalledWith(
      'giantswarm/present-service',
      { team: undefined },
      { mode: 'commit' },
    );
    expect(
      await screen.findByText(
        'Dispatched reconcile-repositories.yaml as alice',
      ),
    ).toBeInTheDocument();
    // Done: the opt-in line stays, the warning and the plan are behind the run.
    expect(screen.getByTestId('opt-in')).toHaveTextContent('has opted in');
    expect(screen.queryByTestId('alignment-warning')).toBeNull();
    expect(screen.queryByTestId('planned')).toBeNull();
    expect(screen.getByRole('link', { name: /Workflow runs/ })).toHaveAttribute(
      'href',
      alignmentOf(true).runsUrl,
    );
    expect(onChanged).toHaveBeenCalled();

    // The dispatch is followed through the record: its pending run is the
    // dispatch, the report waited for; once the run's artifact is in, the
    // report with the run's verdict and the run linked.
    const follow = await screen.findByTestId('live-alignment');
    expect(
      await within(follow).findByTestId('phase-dispatched'),
    ).toHaveTextContent(/^Dispatched at \d\d:\d\d:\d\dZ by alice$/);
    expect(within(follow).getByTestId('phase-reported')).toHaveTextContent(
      'Reported the run has not reported yet; the record expects it since',
    );
    expect(getRepository).toHaveBeenCalledWith('giantswarm/present-service');
    await repositoriesQueryClient.refetchQueries({
      queryKey: ['repositories', 'record', 'giantswarm/present-service'],
    });
    await waitFor(() =>
      expect(within(follow).getByTestId('phase-reported')).toHaveAttribute(
        'data-state',
        'done',
      ),
    );
    expect(within(follow).getByTestId('phase-reported')).toHaveTextContent(
      /^Reported after \d+ s converged run ↗$/,
    );
    expect(within(follow).getByRole('link', { name: /^run/ })).toHaveAttribute(
      'href',
      reported.setup.lastRun!.runUrl,
    );
  });

  it('Align now, team not opted in: the warning and the planned changes, the run checks and changes nothing, Check now', async () => {
    const alignRepository = jest
      .fn()
      .mockResolvedValueOnce(
        alignmentOf(false, { optedIn: false, mode: 'check' }),
      )
      .mockResolvedValueOnce(
        alignmentOf(true, { optedIn: false, mode: 'check' }),
      );
    renderActions({ alignRepository });
    await userEvent.click(button('Align now'));
    await userEvent.click(button('Review'));

    const alignment = await screen.findByTestId('alignment');
    expect(
      within(alignment).getByTestId('alignment-warning'),
    ).toHaveTextContent(alignmentOf(false).warning);
    expect(within(alignment).getByTestId('opt-in')).toHaveTextContent(
      'team-bumblebee has not opted in: this run checks and changes nothing.',
    );
    expect(within(alignment).getByTestId('planned')).toHaveTextContent(
      'main: require the ci/circleci: build status check',
    );
    expect(screen.queryByRole('button', { name: 'Align now' })).toBeNull();

    await userEvent.click(button('Check now'));
    expect(alignRepository).toHaveBeenLastCalledWith(
      'giantswarm/present-service',
      { team: undefined },
      { mode: 'commit' },
    );
    expect(
      await screen.findByText(
        'Dispatched reconcile-repositories.yaml as alice',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('opt-in')).toHaveTextContent(
      'has not opted in: this run checks and changes nothing',
    );
  });

  it('Align now: names no check yet, and nothing to change with when it was checked', async () => {
    const alignRepository = jest
      .fn()
      .mockResolvedValueOnce(
        alignmentOf(false, { planned: undefined, checkedAt: undefined }),
      );
    renderActions({ alignRepository });
    await userEvent.click(button('Align now'));
    await userEvent.click(button('Review'));
    expect(await screen.findByTestId('planned')).toHaveTextContent(
      "No check yet: the run's own check plans the changes.",
    );

    await userEvent.click(button('Back'));
    alignRepository.mockResolvedValueOnce(
      alignmentOf(false, {
        planned: [{ step: 'settings', changes: [] }],
        checkedAt: '2026-09-17T22:00:00Z',
      }),
    );
    await userEvent.click(button('Review'));
    expect(await screen.findByTestId('planned')).toHaveTextContent(
      'Nothing to change. Checked at 2026-09-17T22:00:00Z.',
    );
  });

  it('Align now on an undeclared repository needs the team', async () => {
    const alignRepository = jest.fn().mockResolvedValue(alignmentOf(false));
    renderActions({ alignRepository }, strayTool);
    await userEvent.click(button('Align now'));
    expect(button('Review')).toBeDisabled();
    await userEvent.type(
      within(dialog(/^Align stray-tool now/)).getByLabelText(/^Team/),
      'team-planeteers',
    );
    await userEvent.click(button('Review'));
    expect(alignRepository).toHaveBeenCalledWith(
      'giantswarm/stray-tool',
      { team: 'team-planeteers' },
      { dryRun: true },
    );
  });
});
