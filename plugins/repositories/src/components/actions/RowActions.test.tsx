import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import {
  InventoryRecord,
  RepositoriesApi,
  repositoriesApiRef,
} from '../../apis';
import { createInMemoryApi } from '../../fixtures/inMemoryApi';
import {
  alignmentOf,
  committedOf,
  legacyTool,
  optInAlignmentOf,
  planOf,
  presentService,
  strayTool,
} from '../../fixtures/records';
import {
  RepositoriesProviders,
  repositoriesQueryClient,
} from '../RepositoriesProviders';
import { REPOSITORY_SETUP_DOCS_URL } from '../../lib/docs';
import { parseEntry } from './dialogs';
import { RowActions } from './RowActions';

const APPLY_REFUSAL =
  'mode "apply" is refused: a repository without its declaration is drift the reconciler reports. Use mode "commit" (a team-file pull request opened as you) or dryRun: true for the rendered change';

type Writes = Pick<
  RepositoriesApi,
  | 'updateRepository'
  | 'adoptRepository'
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
    // The reads as the fixtures answer them (the Transfer choice reads the
    // caller and the listings); every write the test does not give throws.
    ...createInMemoryApi(),
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
/** The done view's Close (the dialog's own X is named Close as well). */
const closeButton = () =>
  screen
    .getAllByRole('button', { name: 'Close' })
    .find(candidate => candidate.textContent === 'Close')!;

/** A `Select`'s trigger: named by its value then its label, so match the label at the end. */
const select = (name: RegExp) => screen.getByRole('button', { name });

/** The receiving-team choice, read: its options' labels. */
async function receivingTeams() {
  const receiving = select(/Receiving team$/);
  await waitFor(() =>
    expect(receiving).toHaveTextContent('Pick the receiving team'),
  );
  await userEvent.click(receiving);
  const options = await screen.findAllByRole('option');
  return { receiving, options, labels: options.map(o => o.textContent) };
}

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
  it('offers Adopt, Deprecate, Archive and Align now for an undeclared repository, none disabled, and says no team file declares it', () => {
    renderActions({}, strayTool);
    for (const name of ['Adopt', 'Deprecate', 'Archive', 'Align now']) {
      expect(button(name)).toBeEnabled();
    }
    for (const name of ['Edit', 'Transfer', 'Delete', 'Keep']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.getByTestId('undeclared-note')).toHaveTextContent(
      'No team file declares giantswarm/stray-tool. Adopt declares it for a team; Deprecate and Archive declare it and end its life in the one pull request.',
    );
  });

  it('offers every action and no such line for a declared repository', () => {
    renderActions({});
    for (const name of [
      'Edit',
      'Transfer',
      'Deprecate',
      'Archive',
      'Align now',
      'Delete',
    ]) {
      expect(button(name)).toBeEnabled();
    }
    expect(screen.queryByRole('button', { name: 'Adopt' })).toBeNull();
    expect(screen.queryByTestId('undeclared-note')).toBeNull();
  });

  /** The entry Adopt sends for stray-tool: what GitHub knows, the generic nature, the generator off. */
  const adoptedStrayTool = {
    name: 'stray-tool',
    componentType: 'unspecified',
    gen: { language: 'go', flavours: ['generic'], ci: { generate: false } },
    description: 'A tool somebody forked and forgot',
    visibility: 'public',
  };

  it('Adopt: opens the Create form on what GitHub knows -- the team a choice, the name fixed, the generator off, not opted in -- and sends the entry to the dry run and the commit', async () => {
    const adoptRepository = jest
      .fn()
      .mockResolvedValueOnce(
        planOf({
          repository: 'giantswarm/stray-tool',
          before: undefined,
          entry:
            '- name: stray-tool\n  componentType: unspecified\n  description: A tool somebody forked and forgot\n  visibility: public\n  gen:\n    language: go\n    flavours:\n      - generic\n    ci:\n      generate: false\n',
          pullRequest: {
            ...planOf().pullRequest,
            branch: 'reposetup/adopt-stray-tool',
            title: 'chore(repositories): adopt stray-tool into team-bumblebee',
          },
          ask: {
            ...planOf().ask!,
            text: 'alice asks to adopt `giantswarm/stray-tool` into team-bumblebee: the repository exists on GitHub and no team file declares it. A member of team-bumblebee other than alice approves.',
          },
        }),
      )
      .mockResolvedValueOnce(
        committedOf({
          pullRequest: {
            ...committedOf().pullRequest!,
            branch: 'reposetup/adopt-stray-tool',
            title: 'chore(repositories): adopt stray-tool into team-bumblebee',
          },
        }),
      );
    const { onChanged } = renderActions({ adoptRepository }, strayTool);
    await userEvent.click(button('Adopt'));

    const form = dialog(/^Adopt stray-tool/);
    expect(form).toHaveTextContent(
      'giantswarm/stray-tool exists on GitHub and no team file declares it.',
    );
    expect(form).toHaveTextContent('a member of the team approves it');
    expect(within(form).getByTestId('adopted-repository')).toHaveTextContent(
      'giantswarm/stray-tool',
    );
    expect(within(form).getByTestId('adopted-repository')).toHaveTextContent(
      'declared by no team file',
    );
    expect(within(form).queryByLabelText(/^Name/)).toBeNull();
    // The team: the caller's own first, and the form opens on it.
    await waitFor(() =>
      expect(select(/Team$/)).toHaveTextContent('team-bumblebee (your team)'),
    );
    // What GitHub knows, as the declaration's start.
    expect(within(form).getByLabelText(/^Description/)).toHaveValue(
      'A tool somebody forked and forgot',
    );
    expect(within(form).getByRole('radio', { name: 'Public' })).toBeChecked();
    expect(within(form).getByTestId('declaration-summary')).toHaveTextContent(
      'unspecified · go · generic · CircleCI config not generated',
    );
    expect(
      within(form).getByRole('checkbox', { name: 'Opted in to alignment' }),
    ).not.toBeChecked();

    await userEvent.type(within(form).getByLabelText(/^Reason/), 'ours');
    await userEvent.click(button('Review'));
    expect(adoptRepository).toHaveBeenCalledWith(
      'giantswarm/stray-tool',
      { team: 'team-bumblebee', entry: adoptedStrayTool, reason: 'ours' },
      { dryRun: true },
    );

    const plan = await screen.findByTestId('plan');
    expect(plan).toHaveTextContent(
      'giantswarm/stray-tool (team-bumblebee) — accepted',
    );
    expect(within(plan).queryByTestId('entry-before')).toBeNull();
    expect(within(plan).getByTestId('entry-after')).toHaveTextContent(
      'name: stray-tool',
    );
    expect(plan).toHaveTextContent('no team file declares it');

    await userEvent.click(button('Open pull request'));
    expect(adoptRepository).toHaveBeenLastCalledWith(
      'giantswarm/stray-tool',
      { team: 'team-bumblebee', entry: adoptedStrayTool, reason: 'ours' },
      { mode: 'commit' },
    );
    const opened = await screen.findByTestId('pull-request-opened');
    expect(opened).toHaveTextContent(
      '#4243 chore(repositories): adopt stray-tool into team-bumblebee',
    );
    expect(onChanged).not.toHaveBeenCalled();
    await userEvent.click(closeButton());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("Adopt: the team and the opt-in are the person's; the entry carries both", async () => {
    const adoptRepository = jest
      .fn()
      .mockResolvedValue(planOf({ repository: 'giantswarm/stray-tool' }));
    renderActions({ adoptRepository }, strayTool);
    await userEvent.click(button('Adopt'));
    const form = dialog(/^Adopt stray-tool/);
    await waitFor(() =>
      expect(select(/Team$/)).toHaveTextContent('team-bumblebee (your team)'),
    );
    await userEvent.click(select(/Team$/));
    await userEvent.click(
      (await screen.findAllByRole('option')).find(
        option => option.textContent === 'team-planeteers',
      )!,
    );
    await userEvent.click(
      within(form).getByRole('checkbox', { name: 'Opted in to alignment' }),
    );
    await userEvent.click(button('Review'));
    expect(adoptRepository).toHaveBeenCalledWith(
      'giantswarm/stray-tool',
      {
        team: 'team-planeteers',
        entry: { ...adoptedStrayTool, align: true },
        reason: undefined,
      },
      { dryRun: true },
    );
  });

  it('Archive on an undeclared repository: the one pull request declares it for the chosen team and archives it; the team and the reason are all there is to fill in', async () => {
    const adoptRepository = jest.fn().mockResolvedValue(
      planOf({
        repository: 'giantswarm/stray-tool',
        before: undefined,
        entry:
          '- name: stray-tool\n  componentType: unspecified\n  lifecycle: archived\n  align: true\n',
      }),
    );
    renderActions({ adoptRepository }, strayTool);
    await userEvent.click(button('Archive'));
    const form = dialog(/^Archive stray-tool/);
    expect(form).toHaveTextContent(
      'giantswarm/stray-tool exists on GitHub and no team file declares it. One pull request, opened as you, declares it for the team chosen below and sets lifecycle: archived',
    );
    expect(form).toHaveTextContent(
      'archives the repository on GitHub and unfollows it on CircleCI',
    );
    expect(form).toHaveTextContent(
      'also opts the repository in to alignment, which the lifecycle needs',
    );
    expect(within(form).queryByTestId('declaration-summary')).toBeNull();
    expect(within(form).queryByTestId('section-alignment')).toBeNull();
    await waitFor(() =>
      expect(select(/Team$/)).toHaveTextContent('team-bumblebee (your team)'),
    );
    await userEvent.type(within(form).getByLabelText(/^Reason/), 'over');
    await userEvent.click(button('Review'));
    expect(adoptRepository).toHaveBeenCalledWith(
      'giantswarm/stray-tool',
      {
        team: 'team-bumblebee',
        entry: { ...adoptedStrayTool, lifecycle: 'archived' },
        reason: 'over',
      },
      { dryRun: true },
    );
    expect(await screen.findByTestId('entry-after')).toHaveTextContent(
      'lifecycle: archived',
    );
  });

  it('Deprecate on an undeclared repository declares it with lifecycle deprecated', async () => {
    const adoptRepository = jest.fn().mockResolvedValue(
      planOf({
        repository: 'giantswarm/stray-tool',
        entry: '- name: stray-tool\n  lifecycle: deprecated\n  align: true\n',
      }),
    );
    renderActions({ adoptRepository }, strayTool);
    await userEvent.click(button('Deprecate'));
    expect(dialog(/^Deprecate stray-tool/)).toHaveTextContent(
      'sets lifecycle: deprecated: security-only Renovate updates',
    );
    await waitFor(() =>
      expect(select(/Team$/)).toHaveTextContent('team-bumblebee (your team)'),
    );
    await userEvent.click(button('Review'));
    expect(adoptRepository).toHaveBeenCalledWith(
      'giantswarm/stray-tool',
      expect.objectContaining({
        team: 'team-bumblebee',
        entry: expect.objectContaining({ lifecycle: 'deprecated' }),
      }),
      { dryRun: true },
    );
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
    // Done: Cancel became Close (the dialog's own X is a Close as well). The
    // listing is re-read once the dialog closes, not while it shows the result.
    expect(onChanged).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).toBeNull();
    await userEvent.click(closeButton());
    expect(onChanged).toHaveBeenCalledTimes(1);
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
    // The listing is re-read once the dialog closes, not while it shows the result.
    expect(onChanged).not.toHaveBeenCalled();
    await userEvent.click(closeButton());
    expect(onChanged).toHaveBeenCalledTimes(1);
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

  it('Transfer: says who gives and who takes, offers the teams as a choice without the giving one, and says the receiving team approves', async () => {
    const transferRepository = jest.fn().mockResolvedValue(
      planOf({
        team: 'team-planeteers',
        fromTeam: 'team-bumblebee',
        ask: {
          team: 'team-planeteers',
          channel: 'C07N9PVV97S',
          channelName: 'team-planeteers',
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
      'team-bumblebee gives giantswarm/present-service; the team chosen below takes it.',
    );
    expect(form).toHaveTextContent(
      "receiving team's channel and its member approves",
    );
    expect(form).toHaveTextContent('team-bumblebee gives and is not offered');
    expect(button('Review')).toBeDisabled();
    // The choice is the Create form's -- the teams the inventory knows --
    // less the giving team: of the fixtures' two, team-planeteers.
    const { receiving, options, labels } = await receivingTeams();
    expect(labels).toEqual(['team-planeteers']);
    await userEvent.click(options[0]);
    expect(receiving).toHaveTextContent('team-planeteers');
    expect(button('Review')).toBeEnabled();
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

  it('Transfer: offers the caller’s own team first, labelled, when another team gives', async () => {
    const transferRepository = jest
      .fn()
      .mockResolvedValue(
        planOf({ team: 'team-bumblebee', fromTeam: 'team-planeteers' }),
      );
    renderActions({ transferRepository }, legacyTool);
    await userEvent.click(button('Transfer'));
    expect(dialog(/^Transfer legacy-tool/)).toHaveTextContent(
      'team-planeteers gives giantswarm/legacy-tool',
    );
    const { options, labels } = await receivingTeams();
    expect(labels).toEqual(['team-bumblebee (your team)']);
    await userEvent.click(options[0]);
    await userEvent.click(button('Review'));
    expect(transferRepository).toHaveBeenCalledWith(
      'giantswarm/legacy-tool',
      { toTeam: 'team-bumblebee', reason: undefined },
      { dryRun: true },
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

  it('Align now, repository opted in: the dry run as the dialog opens, one sentence with the intranet link, the planned changes, Align now, then the dispatch followed to the run’s report', async () => {
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
    // Nothing to fill in: the dry run is the dialog's opening move, and
    // there is no Review step between the click and the plan.
    expect(alignRepository).toHaveBeenCalledWith(
      'giantswarm/present-service',
      { team: undefined },
      { dryRun: true },
    );
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();

    const alignment = await screen.findByTestId('alignment');
    expect(within(alignment).getByTestId('lead')).toHaveTextContent(
      'Applies the declared set-up and the company baseline to giantswarm/present-service on GitHub and CircleCI, as you. How alignment works',
    );
    expect(
      within(alignment).getByRole('link', { name: /How alignment works/ }),
    ).toHaveAttribute('href', REPOSITORY_SETUP_DOCS_URL);
    // The manager's paragraph and the dispatch preview are not repeated:
    // the sentence and the link carry it.
    expect(form).not.toHaveTextContent(alignmentOf(false).warning);
    expect(form).not.toHaveTextContent('Would dispatch');
    expect(screen.queryByTestId('dispatch')).toBeNull();
    const planned = within(alignment).getByTestId('planned');
    expect(planned).toHaveTextContent(/^Planned changes · checked .+ ago/);
    expect(planned).toHaveTextContent('protection');
    expect(planned).toHaveTextContent(
      'main: require the ci/circleci: build status check',
    );
    expect(planned).toHaveTextContent('main: enforce for administrators');
    expect(planned).toHaveTextContent('circleci');
    expect(planned).toHaveTextContent('follow the project');
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Opt in and align' }),
    ).toBeNull();

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
    expect(screen.getByTestId('dispatch')).toHaveTextContent(
      "the completion message follows in team-bumblebee's channel",
    );
    expect(screen.getByRole('link', { name: /Workflow runs/ })).toHaveAttribute(
      'href',
      alignmentOf(true).runsUrl,
    );
    // Done: the plan is behind the run.
    expect(screen.queryByTestId('lead')).toBeNull();
    expect(screen.queryByTestId('planned')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();

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
    // The listing is re-read when the dialog closes.
    await userEvent.click(closeButton());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('Align now, repository declared but not opted in: the sentence names the pull request and who approves, the planned changes, Opt in and align, then the pull request opened', async () => {
    const alignRepository = jest
      .fn()
      .mockResolvedValueOnce(optInAlignmentOf(false))
      .mockResolvedValueOnce(optInAlignmentOf(true));
    const { onChanged } = renderActions({ alignRepository });
    await userEvent.click(button('Align now'));

    const alignment = await screen.findByTestId('alignment');
    expect(within(alignment).getByTestId('lead')).toHaveTextContent(
      'giantswarm/present-service has not opted in to alignment. Opt in and align opens a pull request as you that sets align: true in its entry; a member of team-bumblebee approves it and the reconciler applies the changes below when it merges. How alignment works',
    );
    expect(within(alignment).getByTestId('planned')).toHaveTextContent(
      'main: require the ci/circleci: build status check',
    );
    // The entry before and after, the pull request and the ask are the
    // manager's plan; the sentence stands for them. Nothing is dispatched.
    expect(screen.queryByTestId('plan')).toBeNull();
    expect(screen.queryByTestId('dispatch')).toBeNull();
    expect(screen.queryByTestId('alignment-warning')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Align now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Check now' })).toBeNull();

    await userEvent.click(button('Opt in and align'));
    expect(alignRepository).toHaveBeenLastCalledWith(
      'giantswarm/present-service',
      { team: undefined },
      { mode: 'commit' },
    );
    const opened = await screen.findByTestId('pull-request-opened');
    expect(opened).toHaveTextContent(
      '#4244 chore(repositories): opt present-service in to alignment (team-bumblebee)',
    );
    expect(opened).toHaveTextContent(
      'The ask posted to #team-bumblebee (team-bumblebee).',
    );
    expect(
      within(opened).getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/github/pull/4244');
    expect(
      screen.getByText('Pull request opened as alice'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('then')).toHaveTextContent(
      'When it merges, the reconciler aligns giantswarm/present-service; the row shows the run until it reports.',
    );
    // Done: the plan is behind the commit; there is no run to follow yet.
    expect(screen.queryByTestId('lead')).toBeNull();
    expect(screen.queryByTestId('planned')).toBeNull();
    expect(screen.queryByTestId('dispatch')).toBeNull();
    expect(screen.queryByTestId('live-alignment')).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
    await userEvent.click(closeButton());
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('Align now on an undeclared repository: asks for the team, runs no dry run, and Check now dispatches the check', async () => {
    const checked = alignmentOf(true, {
      inputs: { repository: 'stray-tool', team: 'team-planeteers' },
      team: 'team-planeteers',
      optedIn: false,
      mode: 'check',
    });
    const alignRepository = jest.fn().mockResolvedValueOnce(checked);
    renderActions({ alignRepository }, strayTool);
    await userEvent.click(button('Align now'));
    const form = dialog(/^Align stray-tool now/);
    expect(form).toHaveTextContent(
      'giantswarm/stray-tool has no entry in a team file, so it cannot be aligned yet: the run checks it against the baseline for the team named below and changes nothing.',
    );
    expect(
      within(form).getByRole('link', { name: /How alignment works/ }),
    ).toHaveAttribute('href', REPOSITORY_SETUP_DOCS_URL);
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    expect(button('Check now')).toBeDisabled();
    expect(alignRepository).not.toHaveBeenCalled();

    await userEvent.type(
      within(form).getByLabelText(/^Team/),
      'team-planeteers',
    );
    await userEvent.click(button('Check now'));
    expect(alignRepository).toHaveBeenCalledTimes(1);
    expect(alignRepository).toHaveBeenCalledWith(
      'giantswarm/stray-tool',
      { team: 'team-planeteers' },
      { mode: 'commit' },
    );
    expect(
      await screen.findByText(
        'Dispatched reconcile-repositories.yaml as alice',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByTestId('live-alignment')).toBeInTheDocument();
  });

  it('Align now: names no check yet, and nothing to change with when it was checked', async () => {
    const alignRepository = jest
      .fn()
      .mockResolvedValueOnce(
        alignmentOf(false, { planned: undefined, checkedAt: undefined }),
      );
    renderActions({ alignRepository });
    await userEvent.click(button('Align now'));
    expect(await screen.findByTestId('planned')).toHaveTextContent(
      "No check yet: the run's own check plans the changes.",
    );

    // Reopened, the dialog asks the manager again.
    await userEvent.click(button('Cancel'));
    alignRepository.mockResolvedValueOnce(
      alignmentOf(false, {
        planned: [{ step: 'settings', changes: [] }],
        checkedAt: '2026-09-17T22:00:00Z',
      }),
    );
    await userEvent.click(button('Align now'));
    expect(await screen.findByTestId('planned')).toHaveTextContent(
      /^Nothing to change · checked .+ ago\.$/,
    );
    expect(alignRepository).toHaveBeenCalledTimes(2);
  });
});
