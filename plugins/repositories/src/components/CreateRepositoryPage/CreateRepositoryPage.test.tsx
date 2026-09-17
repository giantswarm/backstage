import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { ManagerInfo, RepositoriesApi, repositoriesApiRef } from '../../apis';
import { unusedWrites } from '../../fixtures/fakeApi';
import {
  acceptedValidation,
  ciRefusedValidation,
  configurationValidation,
  createdRepository,
  newService,
  noticedValidation,
  refusedValidation,
} from '../../fixtures/records';
import {
  RepositoriesProviders,
  repositoriesQueryClient,
} from '../RepositoriesProviders';
import {
  CreateRepositoryPage,
  DeclarationForm,
  fixOf,
  toEntry,
} from './CreateRepositoryPage';

const info: ManagerInfo = {
  version: 'v0.9.4',
  toolPrefix: 'giantswarm-repo-manager',
  caller: {
    email: 'alice@example.com',
    groups: ['giantswarm-github:giantswarm:team-bumblebee'],
  },
  github: {
    apiUrl: '',
    grant: { obtained: true, login: 'alice' },
    circleciConfigured: false,
  },
  inventory: { connected: true, records: 3 },
};

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
    listRepositories: unusedWrites.validateRepository as never,
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
const ciGenerate = () =>
  screen.getByRole('checkbox', { name: 'Generate CircleCI config' });

async function fillDeclaration() {
  await waitFor(() => expect(field(/^Team/)).toHaveValue('team-bumblebee'));
  await userEvent.type(field(/^Name/), 'shiny-service');
  await userEvent.type(field(/^Component type/), 'service');
  await userEvent.type(field(/^Language/), 'go');
  await userEvent.type(field(/^Flavours/), 'app, cli');
  await userEvent.type(field(/^Description/), 'Shines');
  await userEvent.type(field(/^Reason/), 'we need shine');
}

/** The Go service the tests declare; the CircleCI generator on, as the form opens. */
const declaration = {
  team: 'team-bumblebee',
  entry: {
    name: 'shiny-service',
    componentType: 'service',
    gen: { language: 'go', flavours: ['app', 'cli'], ci: { generate: true } },
    description: 'Shines',
  },
  reason: 'we need shine',
};

const emptyForm: DeclarationForm = {
  team: 'team-bumblebee',
  name: '',
  componentType: '',
  language: '',
  flavours: '',
  description: '',
  visibility: '',
  ciGenerate: true,
  reason: '',
};

beforeEach(() => repositoriesQueryClient.clear());

describe('toEntry', () => {
  it('builds the entry as the team file takes it, leaves empty fields out and writes gen.ci.generate out', () => {
    expect(
      toEntry({
        ...emptyForm,
        name: ' x ',
        language: 'go',
        flavours: 'app, ,cli',
        visibility: 'private',
      }),
    ).toEqual({
      name: 'x',
      gen: { language: 'go', flavours: ['app', 'cli'], ci: { generate: true } },
      visibility: 'private',
    });
  });

  it('writes gen.ci.generate: false when the CircleCI generator is off, as devctl repo create does', () => {
    expect(
      toEntry({
        ...emptyForm,
        name: 'configs',
        componentType: 'configuration',
        language: 'generic',
        flavours: 'generic',
        ciGenerate: false,
      }),
    ).toEqual({
      name: 'configs',
      componentType: 'configuration',
      gen: {
        language: 'generic',
        flavours: ['generic'],
        ci: { generate: false },
      },
    });
  });
});

describe('fixOf', () => {
  it('reads the value the refusal of gen.ci.generate tells the person to set', () => {
    expect(
      fixOf({
        field: 'gen.ci.generate',
        message: 'no CircleCI job for language generic …; set it to false',
      }),
    ).toEqual({ ciGenerate: false });
  });

  it('offers nothing for a text field or a refusal that names no value', () => {
    expect(fixOf({ field: 'name', message: 'exists already' })).toBeUndefined();
    expect(
      fixOf({ field: 'gen.ci.generate', message: 'must be a boolean' }),
    ).toBeUndefined();
  });
});

describe('CreateRepositoryPage', () => {
  it('says what Create does, in the order the manager writes as the person', async () => {
    await renderPage({});
    expect(
      screen.getByText(
        /created as you: the repository, one scaffold commit on its default branch \(its first release follows from that push\), then the declaration/,
      ),
    ).toBeInTheDocument();
    expect(ciGenerate()).toBeChecked();
  });

  it('opens on the person’s team, dry-runs the declaration with its reason and shows the rendered entry and the creation plan', async () => {
    const validateRepository = jest.fn().mockResolvedValue(acceptedValidation);
    await renderPage({ validateRepository });
    expect(button('Review')).toBeDisabled();
    await fillDeclaration();
    await userEvent.click(button('Review'));
    expect(validateRepository).toHaveBeenCalledWith(declaration);

    const dryRun = await screen.findByTestId('dry-run');
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
    // The creation as the person would run it: create, scaffold, then the
    // pull request -- the manager's plan, rendered as such.
    const plan = within(dryRun).getByTestId('creation-plan');
    expect(plan).toHaveTextContent(
      'shiny-service: create — create giantswarm/shiny-service (private); scaffold — render the scaffold and push it as the first commit on main',
    );
    expect(within(plan).getByTestId('planned-pull-request')).toHaveTextContent(
      'then the pull request on giantswarm/github as alice',
    );
    expect(screen.queryByTestId(/^notice-/)).toBeNull();
    expect(button('Create')).toBeEnabled();
  });

  it('shows the guard notice the manager returns for a person outside the team', async () => {
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(noticedValidation),
    });
    await fillDeclaration();
    await userEvent.click(button('Review'));
    const notice = await screen.findByTestId('notice-team-review');
    expect(notice).toHaveTextContent(
      "alice is not a member of team-bumblebee or team-planeteers: the team's review will be required",
    );
    expect(screen.getByTestId('dry-run')).toHaveTextContent(
      'accepted; a person reviews the pull request',
    );
  });

  it('shows the refusals as the manager returns them, per field, and the name check', async () => {
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(refusedValidation),
    });
    await fillDeclaration();
    await userEvent.click(button('Review'));
    const entry = await screen.findByTestId('dry-run-present-service');
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
    expect(field(/^Flavours/)).toHaveAttribute('aria-invalid', 'true');
    expect(field(/^Language/)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('dry-run-findings')).toHaveTextContent(
      '[entry-refused] name: giantswarm/present-service exists on GitHub already — fix: pick another name',
    );
    expect(screen.getByTestId('dry-run')).toHaveTextContent('— refused');
    // The manager refused: there is nothing to commit until the form changes.
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });

  it('a configuration repository: the refusal of gen.ci.generate is one click that sets it off and reviews again', async () => {
    const validateRepository = jest
      .fn()
      .mockResolvedValueOnce(ciRefusedValidation)
      .mockResolvedValueOnce(configurationValidation);
    await renderPage({ validateRepository });
    await waitFor(() => expect(field(/^Team/)).toHaveValue('team-bumblebee'));
    await userEvent.type(field(/^Name/), 'shiny-config');
    await userEvent.type(field(/^Component type/), 'configuration');
    await userEvent.type(field(/^Language/), 'generic');
    await userEvent.type(field(/^Flavours/), 'generic');
    await userEvent.click(button('Review'));
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
    const refusedEntry = await screen.findByTestId('dry-run-shiny-config');
    expect(refusedEntry).toHaveTextContent('shiny-config: refused');
    const problems = within(refusedEntry).getByTestId('problems');
    expect(problems).toHaveTextContent(
      'gen.ci.generate: no CircleCI job for language generic without the app flavour or gen.ci.image.dockerfile; set it to false',
    );
    expect(ciGenerate()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('dry-run-findings')).toHaveTextContent(
      '[gen-circleci-refused]',
    );
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();

    await userEvent.click(
      within(problems).getByRole('button', {
        name: 'Set Generate CircleCI config to off',
      }),
    );
    expect(ciGenerate()).not.toBeChecked();
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
    const accepted = await screen.findByTestId('dry-run-shiny-config');
    await waitFor(() =>
      expect(accepted).toHaveTextContent('shiny-config: accepted'),
    );
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
    await userEvent.click(button('Review'));
    await screen.findByTestId('dry-run');
    await userEvent.click(button('Create'));
    expect(createRepository).toHaveBeenCalledWith(declaration, {
      mode: 'commit',
    });

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
    await userEvent.click(button('Review'));
    await screen.findByTestId('dry-run');
    await userEvent.click(button('Create'));
    expect(
      await screen.findByText('giantswarm-repo-manager refused'),
    ).toBeInTheDocument();
    expect(screen.getByText(refusal)).toBeInTheDocument();
    expect(screen.queryByTestId('repository-created')).toBeNull();
    expect(screen.queryByTestId('live-setup')).toBeNull();
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual([
      'Review',
      'Create',
    ]);
  });

  it('a changed field drops the dry run: the declaration is another one', async () => {
    await renderPage({
      validateRepository: jest.fn().mockResolvedValue(acceptedValidation),
    });
    await fillDeclaration();
    await userEvent.click(button('Review'));
    await screen.findByTestId('dry-run');
    await userEvent.click(ciGenerate());
    expect(ciGenerate()).not.toBeChecked();
    expect(screen.queryByTestId('dry-run')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });
});
