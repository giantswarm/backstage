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
    circleciConfigured: false,
  },
  inventory: { connected: true, records: 3 },
};

/** The inventory the Team choice reads the other teams off. */
const inventory: RepositoryListing = listingOf(
  Object.values(records).map(rowOf),
  Object.keys(records).length,
);

/** The caller's repositories: the manager read the person's teams on GitHub -- team-bumblebee. */
const mine: RepositoryListing = listingOf(
  Object.values(records)
    .filter(record => record.declaration?.team === 'team-bumblebee')
    .map(rowOf),
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

/** The team is read off the caller; the kind is picked, the name typed. */
async function fillDeclaration(kind = /^Go service/, name = 'shiny-service') {
  await waitFor(() =>
    expect(select(/Team$/)).toHaveTextContent('team-bumblebee (your team)'),
  );
  await userEvent.click(radio(kind));
  await userEvent.type(field(/^Name/), name);
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
  it('says what Create does and opens as a Go service for the person’s team, the review waiting for a name', async () => {
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
    expect(select(/Component type$/)).toHaveTextContent('service');
    expect(select(/Language$/)).toHaveTextContent('go');
    expect(screen.getByRole('checkbox', { name: 'app' })).toBeChecked();
    expect(ciGenerate()).toBeChecked();
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

  it('a kind fills the generation fields; a field set by hand reads as Custom and follows the CircleCI rule', async () => {
    const validateRepository = jest.fn().mockResolvedValue(acceptedValidation);
    await renderPage({ validateRepository });
    await fillDeclaration(/^Configuration/, 'shiny-config');
    expect(select(/Component type$/)).toHaveTextContent('configuration');
    expect(select(/Language$/)).toHaveTextContent('generic');
    expect(screen.getByRole('checkbox', { name: 'generic' })).toBeChecked();
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

    // The app flavour added by hand: no kind matches, and a chart is a job.
    await userEvent.click(screen.getByRole('checkbox', { name: 'app' }));
    expect(radio(/^Custom\b/)).toBeChecked();
    expect(ciGenerate()).toBeChecked();
    await answered();
    expect(validateRepository).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({
          gen: {
            language: 'generic',
            flavours: ['generic', 'app'],
            ci: { generate: true },
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
    // The kind turned the generator off; the person turns it back on.
    await userEvent.click(ciGenerate());
    expect(ciGenerate()).toBeChecked();
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

  it('Create creates the repository, pushes the scaffold and opens the pull request as the person, then follows the set-up live', async () => {
    const createRepository = jest.fn().mockResolvedValue(createdRepository);
    const getRepository = jest
      .fn()
      .mockRejectedValueOnce(notFound())
      .mockResolvedValue({
        ...newService,
        name: 'shiny-service',
        repository: 'giantswarm/shiny-service',
      });
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(acceptedValidation),
      createRepository,
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

    // The three artefacts in the order the manager wrote them.
    const created = await screen.findByTestId('repository-created');
    expect(screen.getByText('Created as alice')).toBeInTheDocument();
    const items = within(created).getAllByRole('listitem');
    expect(items.map(item => item.textContent)).toEqual([
      'Repository giantswarm/shiny-service',
      "Scaffold commit a1b2c3d on its default branch — v0.1.0 follows from the scaffold's auto-release",
      "Pull request, declaring shiny-service in the team's file",
    ]);
    expect(
      within(items[0]).getByRole('link', { name: 'giantswarm/shiny-service' }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/shiny-service');
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
    expect(ciGenerate()).toBeDisabled();
    expect(radio(/^Go service/)).toBeDisabled();

    // The set-up: waiting while the manager knows no record, then the steps.
    const live = screen.getByTestId('live-setup');
    expect(await within(live).findByTestId('setup-waiting')).toHaveTextContent(
      'Waiting for the pull request to merge: the reconciler sets shiny-service up after that (the repository and its scaffold exist already)',
    );
    expect(getRepository).toHaveBeenCalledWith('shiny-service');
    // The next probe finds the record (the poll is 15 s; ask the cache directly).
    await repositoriesQueryClient.refetchQueries({
      queryKey: ['repositories', 'record', 'shiny-service'],
    });
    expect(await within(live).findByTestId('setup-state')).toHaveTextContent(
      'not converged',
    );
    expect(
      within(within(live).getByTestId('setup-steps')).getByRole('row', {
        name: /scaffold/,
      }),
    ).toHaveTextContent('drift');
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
