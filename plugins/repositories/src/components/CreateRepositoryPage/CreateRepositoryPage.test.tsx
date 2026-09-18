import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import {
  ListFilters,
  ManagerInfo,
  RepositoriesApi,
  repositoriesApiRef,
  RepositoryListing,
  Watch,
} from '../../apis';
import { unusedWrites } from '../../fixtures/fakeApi';
import {
  acceptedValidation,
  ciRefusedValidation,
  configurationValidation,
  createdRepository,
  listingOf,
  newService,
  noticedValidation,
  refusedValidation,
  rowOf,
  records,
  watchOf,
  watchReady,
  watchRedRelease,
} from '../../fixtures/records';
import {
  RepositoriesProviders,
  repositoriesQueryClient,
} from '../RepositoriesProviders';
import {
  CreateRepositoryPage,
  DRY_RUN_DEBOUNCE_MS,
} from './CreateRepositoryPage';

/**
 * The caller as the manager reports it behind the GitHub App: the login,
 * no team groups (GitHub's identity carries none; a lab Dex does). The
 * person's teams come from the `mine` listing.
 */
const info: ManagerInfo = {
  version: 'v0.9.4',
  toolPrefix: 'giantswarm-repo-manager',
  caller: { email: 'alice@example.com' },
  github: {
    apiUrl: '',
    grant: { obtained: true, login: 'alice' },
  },
  inventory: { connected: true, records: 3 },
  circleci: { source: 'statuses+artifact' },
};

/** The inventory the Team choice reads the other teams off. */
const inventory: RepositoryListing = listingOf(
  Object.values(records).map(record => rowOf(record)),
  Object.keys(records).length,
);

/** The caller's repositories: the manager read the person's teams on GitHub -- team-bumblebee. */
const mine: RepositoryListing = listingOf(
  Object.values(records)
    .filter(record => record.declaration?.team === 'team-bumblebee')
    .map(record => rowOf(record)),
  Object.keys(records).length,
);

/** `list_repositories` by scope: the caller's own, or the whole inventory. */
const listRepositories = async (filters: ListFilters) =>
  filters.scope === 'mine' ? mine : inventory;

/** Long enough for the debounce and the dry run to answer. */
const AFTER_DEBOUNCE = { timeout: DRY_RUN_DEBOUNCE_MS * 4 };

function notFound() {
  const error = new Error('giantswarm/shiny-service: no record');
  error.name = 'NotFoundError';
  return error;
}

async function renderPage(writes: Partial<RepositoriesApi>) {
  const api = {
    ...unusedWrites,
    getConnection: async () => ({ connected: true }),
    getInfo: async () => info,
    listRepositories,
    getRepository: async () => {
      throw notFound();
    },
    refreshRepository: unusedWrites.validateRepository as never,
    ...writes,
  } as RepositoriesApi;
  await renderInTestApp(
    <TestApiProvider apis={[[repositoriesApiRef, api]]}>
      <RepositoriesProviders>
        <CreateRepositoryPage />
      </RepositoriesProviders>
    </TestApiProvider>,
  );
  await screen.findByRole('heading', { name: 'Create repository' });
}

const field = (name: RegExp) => screen.getByLabelText(name);
const button = (name: string) => screen.getByRole('button', { name });
const radio = (name: RegExp) => screen.getByRole('radio', { name });
const ciGenerate = () =>
  screen.getByRole('checkbox', { name: 'Generate CircleCI config' });
/** A `Select`'s trigger: named by its value then its label, so match the label at the end. */
const select = (label: RegExp) => screen.getByRole('button', { name: label });

/** The dry run for the form as it stands has answered. */
async function answered() {
  await waitFor(
    () => expect(screen.queryByTestId('dry-run-checking')).toBeNull(),
    AFTER_DEBOUNCE,
  );
  return screen.getByTestId('dry-run');
}

const summary = () => screen.getByTestId('declaration-summary');
const source = () => screen.getByTestId('declaration-source');

/** The team is read off the caller; the preset is picked, the name typed. */
async function fillDeclaration(preset = /^Go service/, name = 'shiny-service') {
  await waitFor(() =>
    expect(select(/Team$/)).toHaveTextContent('team-bumblebee (your team)'),
  );
  await userEvent.click(radio(preset));
  await userEvent.type(field(/^Name/), name);
}

/** Adjust opens the declaration's raw controls. */
async function adjust() {
  await userEvent.click(button('Adjust'));
  return screen.getByTestId('declaration-fields');
}

/** The Go service the tests declare; the CircleCI generator on, as the form opens. */
const declaration = {
  team: 'team-bumblebee',
  entry: {
    name: 'shiny-service',
    componentType: 'service',
    gen: { language: 'go', flavours: ['app'], ci: { generate: true } },
  },
  reason: undefined,
};

beforeEach(() => repositoriesQueryClient.clear());

describe('CreateRepositoryPage', () => {
  it('says what Create does and opens as a Go service for the person’s team, the declaration as the preset’s result, the review waiting for a name', async () => {
    await renderPage({});
    expect(
      screen.getByText(
        /created as you: the repository, one scaffold commit on its default branch \(its first release follows from that push\), then the declaration/,
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(select(/Team$/)).toHaveTextContent('team-bumblebee (your team)'),
    );
    expect(radio(/^Go service/)).toBeChecked();
    expect(summary()).toHaveTextContent(
      'service · go · app · CircleCI config generated',
    );
    expect(source()).toHaveTextContent('Set by the Go service preset.');
    // The raw controls wait behind Adjust.
    expect(screen.queryByTestId('declaration-fields')).toBeNull();
    expect(button('Adjust')).toHaveAttribute('aria-expanded', 'false');
    expect(radio(/^Private/)).toBeChecked();
    expect(screen.getByTestId('review-hint')).toHaveTextContent(
      'Pick the team and a name',
    );
    expect(button('Create')).toBeDisabled();
    expect(screen.queryByTestId('dry-run')).toBeNull();
  });

  it('offers the caller’s teams first -- read off the mine listing, the identity carrying no groups -- and the inventory’s after', async () => {
    await renderPage({});
    await waitFor(() =>
      expect(select(/Team$/)).toHaveTextContent('team-bumblebee (your team)'),
    );
    await userEvent.click(select(/Team$/));
    const options = await screen.findAllByRole('option');
    expect(options.map(option => option.textContent)).toEqual([
      'team-bumblebee (your team)',
      'team-planeteers',
    ]);
    await userEvent.click(options[1]);
    expect(select(/Team$/)).toHaveTextContent('team-planeteers');
  });

  it('dry-runs the declaration as typed, once the person pauses, and shows the rendered entry and the creation plan', async () => {
    const validateRepository = jest.fn().mockResolvedValue(acceptedValidation);
    await renderPage({ validateRepository });
    await fillDeclaration();
    const dryRun = await answered();
    expect(validateRepository).toHaveBeenLastCalledWith(declaration);
    // One dry run for the settled form, not one per keystroke.
    expect(validateRepository).toHaveBeenCalledTimes(1);

    expect(dryRun).toHaveTextContent(
      'team-bumblebee — as alice — accepted; the pull request is approved by the machine once opened',
    );
    const entry = within(dryRun).getByTestId('dry-run-shiny-service');
    expect(entry).toHaveTextContent(
      'shiny-service: accepted · name free · template giantswarm/template',
    );
    expect(within(entry).getByTestId('entry-entry')).toHaveTextContent(
      'ci: generate: true',
    );
    const plan = within(dryRun).getByTestId('creation-plan');
    expect(plan).toHaveTextContent(
      'shiny-service: create — create giantswarm/shiny-service (private); scaffold — render the scaffold and push it as the first commit on main',
    );
    expect(within(plan).getByTestId('planned-pull-request')).toHaveTextContent(
      'then the pull request on giantswarm/github as alice',
    );
    expect(screen.getByTestId('name-check')).toHaveTextContent(
      'giantswarm/shiny-service is free on GitHub',
    );
    expect(screen.queryByTestId(/^notice-/)).toBeNull();
    expect(button('Create')).toBeEnabled();
  });

  it('a preset fills the declaration; Adjust opens its raw controls, where a nature set by hand matches no preset and follows the CircleCI rule', async () => {
    const validateRepository = jest.fn().mockResolvedValue(acceptedValidation);
    await renderPage({ validateRepository });
    await fillDeclaration(/^Configuration/, 'shiny-config');
    expect(summary()).toHaveTextContent(
      'configuration · generic · generic · CircleCI config not generated',
    );
    expect(source()).toHaveTextContent('Set by the Configuration preset.');
    await answered();
    expect(validateRepository).toHaveBeenLastCalledWith({
      team: 'team-bumblebee',
      entry: {
        name: 'shiny-config',
        componentType: 'configuration',
        gen: {
          language: 'generic',
          flavours: ['generic'],
          ci: { generate: false },
        },
      },
      reason: undefined,
    });

    // The raw controls: the catalog type, the language, the nature as one
    // choice, the add-ons, the CircleCI switch.
    const fields = await adjust();
    expect(button('Done')).toHaveAttribute('aria-expanded', 'true');
    expect(select(/Catalog type$/)).toHaveTextContent('configuration');
    expect(select(/Language$/)).toHaveTextContent('generic');
    expect(radio(/^generic$/)).toBeChecked();
    expect(radio(/^app$/)).not.toBeChecked();
    expect(ciGenerate()).not.toBeChecked();
    const clusterApp = within(fields).getByRole('checkbox', {
      name: 'cluster-app',
    });
    // An add-on to app: disabled with another nature, and saying so.
    expect(clusterApp).toBeDisabled();
    expect(clusterApp).toHaveAccessibleDescription(
      /Only with the app nature\./,
    );

    // The app nature by hand: no preset matches, and a chart is a job.
    await userEvent.click(radio(/^app$/));
    expect(source()).toHaveTextContent('Adjusted by hand: no preset matches.');
    expect(
      screen.queryByRole('radio', { checked: true, name: /^Go/ }),
    ).toBeNull();
    expect(ciGenerate()).toBeChecked();
    expect(clusterApp).toBeEnabled();
    await userEvent.click(clusterApp);
    expect(summary()).toHaveTextContent(
      'configuration · generic · app + cluster-app · CircleCI config generated',
    );
    await answered();
    expect(validateRepository).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({
          gen: {
            language: 'generic',
            flavours: ['app', 'cluster-app'],
            ci: { generate: true },
          },
        }),
      }),
    );

    // Back to a nature the add-on does not go with: the add-on is dropped.
    await userEvent.click(radio(/^customer$/));
    expect(clusterApp).not.toBeChecked();
    expect(clusterApp).toBeDisabled();
    expect(summary()).toHaveTextContent(
      'configuration · generic · customer · CircleCI config not generated',
    );
    await userEvent.click(button('Done'));
    expect(screen.queryByTestId('declaration-fields')).toBeNull();
  });

  it('holds the cli flavour to Go as typed, the manager not asked until the rule holds', async () => {
    const validateRepository = jest.fn().mockResolvedValue(acceptedValidation);
    await renderPage({ validateRepository });
    await fillDeclaration(/^Go CLI/, 'shiny-cli');
    await answered();
    expect(validateRepository).toHaveBeenCalledTimes(1);
    await adjust();
    await userEvent.click(select(/Language$/));
    await userEvent.click(screen.getByRole('option', { name: 'python' }));
    expect(screen.getByTestId('flavour-check')).toHaveTextContent(
      'flavour cli is supported only for language go: pick go, or another nature',
    );
    expect(summary()).toHaveTextContent(
      'cli · python · cli · CircleCI config not generated',
    );
    expect(screen.getByTestId('review-hint')).toBeInTheDocument();
    expect(button('Create')).toBeDisabled();
    await new Promise(resolve => setTimeout(resolve, DRY_RUN_DEBOUNCE_MS * 2));
    expect(validateRepository).toHaveBeenCalledTimes(1);

    // Another nature: the rule holds, the dry run follows.
    await userEvent.click(radio(/^generic$/));
    expect(screen.queryByTestId('flavour-check')).toBeNull();
    await answered();
    expect(validateRepository).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({
          gen: {
            language: 'python',
            flavours: ['generic'],
            ci: { generate: false },
          },
        }),
      }),
    );
  });

  it('checks the name against the engine’s rule as typed and asks the manager for nothing until it holds', async () => {
    const validateRepository = jest.fn().mockResolvedValue(acceptedValidation);
    await renderPage({ validateRepository });
    await fillDeclaration(/^Go service/, 'Shiny-app');
    expect(field(/^Name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('name-check')).toHaveTextContent(
      'must be lowercase letters, digits and dashes, starting and ending with a letter or digit (the chart is named after the repository)',
    );
    expect(button('Create')).toBeDisabled();
    await userEvent.clear(field(/^Name/));
    await userEvent.type(field(/^Name/), 'shiny-app');
    expect(screen.getByTestId('name-check')).toHaveTextContent(
      'a chart repository is named after its chart, without the -app suffix',
    );
    // Nothing to check yet: the rule is broken.
    await new Promise(resolve => setTimeout(resolve, DRY_RUN_DEBOUNCE_MS * 2));
    expect(validateRepository).not.toHaveBeenCalled();
    expect(screen.getByTestId('review-hint')).toBeInTheDocument();
  });

  it('shows the guard notice the manager returns for a person outside the team', async () => {
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(noticedValidation),
    });
    await fillDeclaration();
    await answered();
    expect(screen.getByTestId('notice-team-review')).toHaveTextContent(
      "alice is not a member of team-bumblebee or team-planeteers: the team's review will be required",
    );
    expect(screen.getByTestId('dry-run')).toHaveTextContent(
      'accepted; a person reviews the pull request',
    );
    expect(button('Create')).toBeEnabled();
  });

  it('shows the refusals as the manager returns them, per field, and the name check', async () => {
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(refusedValidation),
    });
    await fillDeclaration(/^Go service/, 'present-service');
    const dryRun = await answered();
    const entry = within(dryRun).getByTestId('dry-run-present-service');
    expect(entry).toHaveTextContent(
      'present-service: refused · name taken (giantswarm/present-service exists on GitHub)',
    );
    const problems = within(entry).getByTestId('problems');
    expect(problems).toHaveTextContent(
      'name: giantswarm/present-service exists on GitHub already',
    );
    expect(problems).toHaveTextContent('gen.flavours[0]: value must be one of');
    // A text field's refusal marks the field; what to type is the person's.
    expect(within(problems).queryByRole('button')).toBeNull();
    expect(field(/^Name/)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('name-check')).toHaveTextContent(
      'taken: giantswarm/present-service exists on GitHub',
    );
    expect(screen.getByTestId('dry-run-findings')).toHaveTextContent(
      '[entry-refused] name: giantswarm/present-service exists on GitHub already — fix: pick another name',
    );
    expect(dryRun).toHaveTextContent('— refused');
    // The manager refused: there is nothing to commit until the form changes.
    expect(button('Create')).toBeDisabled();
  });

  it('a configuration repository with the generator forced on: the refusal of gen.ci.generate is one click that sets it off and the dry run follows', async () => {
    const validateRepository = jest
      .fn()
      .mockResolvedValueOnce(ciRefusedValidation)
      .mockResolvedValueOnce(configurationValidation);
    await renderPage({ validateRepository });
    await fillDeclaration(/^Configuration/, 'shiny-config');
    // The preset turned the generator off; the person turns it back on.
    await adjust();
    await userEvent.click(ciGenerate());
    expect(ciGenerate()).toBeChecked();
    expect(summary()).toHaveTextContent('CircleCI config generated');
    await answered();
    expect(validateRepository).toHaveBeenLastCalledWith({
      team: 'team-bumblebee',
      entry: {
        name: 'shiny-config',
        componentType: 'configuration',
        gen: {
          language: 'generic',
          flavours: ['generic'],
          ci: { generate: true },
        },
      },
      reason: undefined,
    });

    // The manager's refusal names the switch and the value; the page offers
    // exactly that as the fix.
    const refusedEntry = screen.getByTestId('dry-run-shiny-config');
    expect(refusedEntry).toHaveTextContent('shiny-config: refused');
    const problems = within(refusedEntry).getByTestId('problems');
    expect(problems).toHaveTextContent(
      'gen.ci.generate: no CircleCI job for language generic without the app flavour or gen.ci.image.dockerfile; set it to false',
    );
    expect(ciGenerate()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('dry-run-findings')).toHaveTextContent(
      '[gen-circleci-refused]',
    );
    expect(button('Create')).toBeDisabled();

    await userEvent.click(
      within(problems).getByRole('button', {
        name: 'Set Generate CircleCI config to off',
      }),
    );
    expect(ciGenerate()).not.toBeChecked();
    await answered();
    expect(validateRepository).toHaveBeenLastCalledWith({
      team: 'team-bumblebee',
      entry: {
        name: 'shiny-config',
        componentType: 'configuration',
        gen: {
          language: 'generic',
          flavours: ['generic'],
          ci: { generate: false },
        },
      },
      reason: undefined,
    });
    const accepted = screen.getByTestId('dry-run-shiny-config');
    expect(accepted).toHaveTextContent('shiny-config: accepted');
    expect(within(accepted).getByTestId('entry-entry')).toHaveTextContent(
      'ci: generate: false',
    );
    expect(within(accepted).queryByTestId('problems')).toBeNull();
    expect(ciGenerate()).not.toHaveAttribute('aria-invalid', 'true');
    expect(button('Create')).toBeEnabled();
  });

  it('Create creates the repository, pushes the scaffold and opens the pull request as the person, then follows the repository to readiness phase by phase', async () => {
    const createRepository = jest.fn().mockResolvedValue(createdRepository);
    // The first call finds the pull request open; the calls after it wait
    // until the test has seen that state, then find every phase done.
    let phasesDone!: (watch: Watch) => void;
    const later = new Promise<Watch>(resolve => {
      phasesDone = resolve;
    });
    const watchRepository = jest
      .fn()
      .mockResolvedValueOnce(watchOf('declared'))
      .mockImplementation(() => later);
    const getRepository = jest.fn().mockResolvedValue({
      ...newService,
      name: 'shiny-service',
      repository: 'giantswarm/shiny-service',
    });
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(acceptedValidation),
      createRepository,
      watchRepository,
      getRepository,
    });
    await fillDeclaration();
    await userEvent.click(radio(/^Public/));
    await userEvent.type(field(/^Description/), 'Shines');
    await userEvent.type(field(/^Reason/), 'we need shine');
    await answered();
    await userEvent.click(button('Create'));
    expect(createRepository).toHaveBeenCalledWith(
      {
        team: 'team-bumblebee',
        entry: {
          ...declaration.entry,
          description: 'Shines',
          visibility: 'public',
        },
        reason: 'we need shine',
      },
      { mode: 'commit' },
    );

    // The three artefacts in the order the manager wrote them; the
    // repository is its name until the follow says it is ready.
    const created = await screen.findByTestId('repository-created');
    expect(screen.getByText('Created as alice')).toBeInTheDocument();
    const items = within(created).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(
      'Repository giantswarm/shiny-service — being set up, see below',
    );
    expect(items.slice(1).map(item => item.textContent)).toEqual([
      "Scaffold commit a1b2c3d on its default branch — v0.1.0 follows from the scaffold's auto-release",
      "Pull request, declaring shiny-service in the team's file",
    ]);
    expect(
      within(items[0]).queryByRole('link', {
        name: 'giantswarm/shiny-service',
      }),
    ).toBeNull();
    expect(
      within(items[1]).getByRole('link', { name: 'a1b2c3d' }),
    ).toHaveAttribute(
      'href',
      'https://github.com/giantswarm/shiny-service/commit/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    );
    const opened = within(created).getByTestId('pull-request-opened');
    expect(opened).toHaveTextContent(
      '#4242 feat(repositories): declare shiny-service for team-bumblebee',
    );
    expect(
      within(opened).getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/github/pull/4242');
    // The form is done: no second Create, the fields frozen.
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
    expect(field(/^Name/)).toBeDisabled();
    expect(button('Adjust')).toBeDisabled();
    expect(radio(/^Go service/)).toBeDisabled();

    // The follow: watch_repository with the pull request the creation
    // opened, one call blocking 20 s at most; the phases as it answered.
    const live = screen.getByTestId('live-setup');
    const phases = await within(live).findByTestId('phases');
    expect(watchRepository).toHaveBeenCalledWith('shiny-service', {
      pullRequest: 4242,
      timeout: 20,
    });
    expect(within(phases).getByTestId('phase-declared')).toHaveTextContent(
      /^Declared after 13 s \(\+9 s\) pull request ↗$/,
    );
    expect(within(phases).getByTestId('phase-merged')).toHaveTextContent(
      'Merged the declaration pull request has not merged yet',
    );
    expect(within(phases).getByTestId('phase-released')).toHaveAttribute(
      'data-state',
      'ahead',
    );
    // No record is asked for before the reconciler has run.
    expect(getRepository).not.toHaveBeenCalled();
    expect(within(live).queryByTestId('setup-ready')).toBeNull();

    // The next call (the page calls again as soon as one answers) finds
    // every phase done: the link is marked ready, the release named, the
    // reconciler run's finding shown, the record with its steps below.
    phasesDone(watchReady);
    const readyAlert = await within(live).findByTestId('setup-ready');
    expect(readyAlert).toHaveTextContent('shiny-service is ready');
    expect(readyAlert).toHaveTextContent(
      'Every phase is done: the first release v0.1.0 built green.',
    );
    expect(within(phases).getByTestId('phase-released')).toHaveTextContent(
      /^Released after 4 min 10 s \(\+1 min 41 s\) v0\.1\.0 ↗$/,
    );
    expect(
      within(items[0]).getByRole('link', { name: 'giantswarm/shiny-service' }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/shiny-service');
    expect(items[0]).toHaveTextContent('ready');
    expect(items[0]).not.toHaveTextContent('being set up');
    expect(within(live).getByTestId('watch-findings')).toHaveTextContent(
      'default-icon',
    );
    expect(await within(live).findByTestId('setup-state')).toHaveTextContent(
      'not converged',
    );
    expect(getRepository).toHaveBeenCalledWith('shiny-service');
    expect(
      within(within(live).getByTestId('setup-steps')).getByRole('row', {
        name: /scaffold/,
      }),
    ).toHaveTextContent('drift');
  });

  it('a red first release is shown with the failing job and the manager’s reason; the repository is not marked ready', async () => {
    const watchRepository = jest.fn().mockResolvedValue(watchRedRelease);
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(acceptedValidation),
      createRepository: jest.fn().mockResolvedValue(createdRepository),
      watchRepository,
      getRepository: jest.fn().mockResolvedValue(newService),
    });
    await fillDeclaration();
    await answered();
    await userEvent.click(button('Create'));
    const live = screen.getByTestId('live-setup');
    const failure = await within(live).findByTestId('setup-failure');
    expect(failure).toHaveTextContent('The first release failed');
    expect(failure).toHaveTextContent(
      'the CircleCI statuses on v0.1.0 are failure: ci/circleci: build (failure)',
    );
    expect(within(live).getByTestId('phase-released')).toHaveAttribute(
      'data-state',
      'failed',
    );
    expect(within(live).getByTestId('phase-setUp')).toHaveAttribute(
      'data-state',
      'done',
    );
    const created = screen.getByTestId('repository-created');
    expect(
      within(created).queryByRole('link', { name: 'giantswarm/shiny-service' }),
    ).toBeNull();
    expect(created).toHaveTextContent('being set up');
    expect(within(live).queryByTestId('setup-ready')).toBeNull();
  });

  it('without a pull request there is nothing to follow, and the page says so', async () => {
    const watchRepository = jest.fn();
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(acceptedValidation),
      createRepository: jest
        .fn()
        .mockResolvedValue({ ...createdRepository, pullRequest: null }),
      watchRepository,
    });
    await fillDeclaration();
    await answered();
    await userEvent.click(button('Create'));
    const live = await screen.findByTestId('live-setup');
    expect(within(live).getByTestId('setup-waiting')).toHaveTextContent(
      'The manager opened no pull request, so there is no set-up to follow',
    );
    expect(watchRepository).not.toHaveBeenCalled();
  });

  it("shows the manager's refusal of the write verbatim and offers no override", async () => {
    const refusal =
      'the engine refuses the declaration: shiny-service: name: giantswarm/shiny-service exists on GitHub already — fix it and run again (dryRun: true shows the rendered entries); nothing was created';
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(acceptedValidation),
      createRepository: jest.fn().mockRejectedValue(new Error(refusal)),
    });
    await fillDeclaration();
    await answered();
    await userEvent.click(button('Create'));
    expect(
      await screen.findByText('giantswarm-repo-manager refused'),
    ).toBeInTheDocument();
    expect(screen.getByText(refusal)).toBeInTheDocument();
    expect(screen.queryByTestId('repository-created')).toBeNull();
    expect(screen.queryByTestId('live-setup')).toBeNull();
    expect(button('Create')).toBeEnabled();
  });

  it('a changed field is another declaration: the review checks again and Create waits for the answer', async () => {
    const validateRepository = jest
      .fn()
      .mockResolvedValueOnce(acceptedValidation)
      .mockImplementationOnce(
        () =>
          new Promise(resolve =>
            setTimeout(() => resolve(acceptedValidation), DRY_RUN_DEBOUNCE_MS),
          ),
      );
    await renderPage({ validateRepository });
    await fillDeclaration();
    await answered();
    expect(button('Create')).toBeEnabled();
    await adjust();
    await userEvent.click(ciGenerate());
    expect(ciGenerate()).not.toBeChecked();
    expect(button('Create')).toBeDisabled();
    expect(
      await screen.findByTestId('dry-run-checking', {}, AFTER_DEBOUNCE),
    ).toHaveTextContent('Checking with giantswarm-repo-manager…');
    await answered();
    expect(validateRepository).toHaveBeenCalledTimes(2);
    expect(validateRepository).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({
          gen: expect.objectContaining({ ci: { generate: false } }),
        }),
      }),
    );
    expect(button('Create')).toBeEnabled();
  });
});
