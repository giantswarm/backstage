import { renderInTestApp } from '@backstage/frontend-test-utils';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestApiProvider } from '@backstage/test-utils';
import { ManagerInfo, RepositoriesApi, repositoriesApiRef } from '../../apis';
import { unusedWrites } from '../../fixtures/fakeApi';
import {
  acceptedValidation,
  committedCreate,
  newService,
  noticedValidation,
  refusedValidation,
} from '../../fixtures/records';
import {
  RepositoriesProviders,
  repositoriesQueryClient,
} from '../RepositoriesProviders';
import { CreateRepositoryPage, toEntry } from './CreateRepositoryPage';

const info: ManagerInfo = {
  version: 'v0.4.1',
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

async function fillDeclaration() {
  await waitFor(() => expect(field(/^Team/)).toHaveValue('team-bumblebee'));
  await userEvent.type(field(/^Name/), 'shiny-service');
  await userEvent.type(field(/^Component type/), 'service');
  await userEvent.type(field(/^Language/), 'go');
  await userEvent.type(field(/^Flavours/), 'app, cli');
  await userEvent.type(field(/^Description/), 'Shines');
  await userEvent.type(field(/^Reason/), 'we need shine');
}

const declaration = {
  team: 'team-bumblebee',
  entry: {
    name: 'shiny-service',
    componentType: 'service',
    gen: { language: 'go', flavours: ['app', 'cli'] },
    description: 'Shines',
  },
  reason: 'we need shine',
};

beforeEach(() => repositoriesQueryClient.clear());

describe('toEntry', () => {
  it('builds the entry as the team file takes it and leaves empty fields out', () => {
    expect(
      toEntry({
        team: 'team-bumblebee',
        name: ' x ',
        componentType: '',
        language: 'go',
        flavours: 'app, ,cli',
        description: '',
        visibility: 'private',
        reason: '',
      }),
    ).toEqual({
      name: 'x',
      gen: { language: 'go', flavours: ['app', 'cli'] },
      visibility: 'private',
    });
  });
});

describe('CreateRepositoryPage', () => {
  it('opens on the person’s team, dry-runs the declaration and shows the rendered entry', async () => {
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
    expect(field(/^Name/)).toHaveAttribute('aria-invalid', 'true');
    expect(field(/^Flavours/)).toHaveAttribute('aria-invalid', 'true');
    expect(field(/^Language/)).not.toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('dry-run-findings')).toHaveTextContent(
      '[entry-refused] name: giantswarm/present-service exists on GitHub already — fix: pick another name',
    );
    expect(screen.getByTestId('dry-run')).toHaveTextContent('— refused');
  });

  it('Create opens the pull request as the person and follows the set-up live', async () => {
    const createRepository = jest.fn().mockResolvedValue(committedCreate);
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

    const opened = await screen.findByTestId('pull-request-opened');
    expect(
      screen.getByText('Pull request opened as alice'),
    ).toBeInTheDocument();
    expect(opened).toHaveTextContent(
      '#4242 feat(repositories): declare shiny-service for team-bumblebee',
    );
    expect(
      within(opened).getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', 'https://github.com/giantswarm/github/pull/4242');
    // The form is done: no second Create, the fields frozen.
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
    expect(field(/^Name/)).toBeDisabled();

    // The set-up: waiting while the manager knows no record, then the steps.
    const live = screen.getByTestId('live-setup');
    expect(await within(live).findByTestId('setup-waiting')).toHaveTextContent(
      'Waiting for the pull request to merge',
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
      within(live).getByRole('table', { name: 'Set-up' }),
    ).toBeInTheDocument();
  });

  it("shows the manager's refusal of the write verbatim and offers no override", async () => {
    const refusal =
      'the engine refuses the declaration: shiny-service: name: giantswarm/shiny-service exists on GitHub already — fix it and run again (dryRun: true shows the rendered entries)';
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
    expect(screen.queryByTestId('pull-request-opened')).toBeNull();
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
    await userEvent.type(field(/^Name/), '2');
    expect(screen.queryByTestId('dry-run')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });
});
