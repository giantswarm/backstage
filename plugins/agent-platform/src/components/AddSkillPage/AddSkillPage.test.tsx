import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import type { SkillPullRequest } from '../../hooks/useProposeSkill';
import { AddSkillPage, type SkillEdit } from './AddSkillPage';

const REPO = 'https://github.com/giantswarm/skills';

let mockRepositories: string[] = [];
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: { getOptionalStringArray: () => mockRepositories },
    isLoading: false,
  }),
}));

const proposeSkill = jest.fn();
let mockState: {
  isProposing: boolean;
  error: Error | null;
  result?: SkillPullRequest;
};
jest.mock('../../hooks/useProposeSkill', () => ({
  ...jest.requireActual('../../hooks/useProposeSkill'),
  useProposeSkill: () => ({
    proposeSkill,
    reset: jest.fn(),
    ...mockState,
  }),
}));

const opened: SkillPullRequest = {
  pullRequestUrl: 'https://github.com/giantswarm/skills/pull/7',
  number: 7,
  branch: 'add-skill/notes',
  base: 'main',
  path: 'notes/SKILL.md',
};

function renderPage(edit?: SkillEdit) {
  return renderInTestApp(
    // The wizard frame's footer renders the actions the page registers, so the
    // slot provider the skills router mounts is mounted here too.
    <PageHeaderActionsProvider>
      <AddSkillPage edit={edit} />
    </PageHeaderActionsProvider>,
  );
}

const COMMIT = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
const edit: SkillEdit = {
  skill: {
    name: 'ticket-triage',
    description: 'How to triage.',
    repoUrl: REPO,
    path: 'support/ticket-triage',
    ref: 'main',
    commit: COMMIT,
  },
  content: {
    repoUrl: REPO,
    path: 'support/ticket-triage',
    commit: COMMIT,
    name: 'ticket-triage',
    description: 'How to triage.',
    instructions: 'Classify, prioritise, route.',
  },
  skillHref: '/agent-platform/skills/giantswarm/skills/support/ticket-triage',
};

beforeEach(() => {
  proposeSkill.mockReset();
  proposeSkill.mockResolvedValue(opened);
  mockState = { isProposing: false, error: null };
  mockRepositories = [REPO];
});

describe('AddSkillPage', () => {
  it('renders in the wizard frame with Cancel leaving to Customize → Skills', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { level: 1, name: 'Add skill' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Customize / Skills')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/customize/skills',
    );
  });

  // Live round L2: without its own title the page fell back to the
  // /agent-platform extension's default, "Sessions".
  it('names itself in the document title', async () => {
    await renderPage();

    await waitFor(() => expect(document.title).toBe('Add skill · Skills'));
  });

  // Typing three fields with userEvent outruns the 5s default under a loaded
  // parallel run, hence the explicit timeouts.
  it('proposes the skill to the configured repository', async () => {
    const user = userEvent.setup();
    await renderPage();

    expect(
      screen.getByText('Repository: giantswarm/skills'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Name/), 'notes');
    await user.type(screen.getByLabelText(/Description/), 'Take notes.');
    await user.type(screen.getByLabelText(/Instructions/), 'Write it down.');
    await user.click(screen.getByRole('button', { name: 'Open pull request' }));

    expect(proposeSkill).toHaveBeenCalledWith({
      repoUrl: REPO,
      skillName: 'notes',
      description: 'Take notes.',
      instructions: 'Write it down.',
    });
  }, 30_000);

  it('marks the missing fields themselves when the submit is blocked', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText(/Name/), 'notes');
    await user.click(screen.getByRole('button', { name: 'Open pull request' }));

    expect(proposeSkill).not.toHaveBeenCalled();
    const description = screen.getByLabelText(/Description/);
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(description).toHaveAccessibleDescription(
      expect.stringContaining('Description is required'),
    );
    expect(description).toHaveFocus();
    const instructions = screen.getByLabelText(/Instructions/);
    expect(instructions).toHaveAttribute('aria-invalid', 'true');
    expect(instructions).toHaveAccessibleDescription(
      expect.stringContaining('Instructions are required'),
    );
    expect(screen.getByLabelText(/Name/)).not.toHaveAttribute('aria-invalid');
  }, 30_000);

  it('says what is wrong with a name while it is typed', async () => {
    const user = userEvent.setup();
    await renderPage();

    const name = screen.getByLabelText(/Name/);
    await user.type(name, 'Notes');

    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining('lowercase letters, digits and dashes'),
    );
  }, 30_000);

  it('shows the opened pull request and what happens next, with Done to leave', async () => {
    mockState = { isProposing: false, error: null, result: opened };
    await renderPage();

    expect(screen.getByText('Pull request #7 opened')).toBeInTheDocument();
    expect(
      screen.getByText(/A teammate reviews and approves it/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', opened.pullRequestUrl);
    const footer = screen.getByRole('contentinfo');
    expect(
      within(footer).getByRole('button', { name: 'Done' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).not.toBeInTheDocument();
  });

  it('shows the backend’s reason when the pull request could not be opened', async () => {
    mockState = {
      isProposing: false,
      error: new Error(
        'A skill named notes already exists in giantswarm/skills.',
      ),
    };
    await renderPage();

    expect(
      screen.getByText('Could not open the pull request'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'A skill named notes already exists in giantswarm/skills.',
      ),
    ).toBeInTheDocument();
  });

  it('says when no repository is configured', async () => {
    mockRepositories = [];
    await renderPage();

    expect(screen.getByText('No skill repositories')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open pull request' }),
    ).not.toBeInTheDocument();
  });
});

describe('AddSkillPage · the repository select at scale', () => {
  const repos = (count: number) =>
    Array.from(
      { length: count },
      (_, i) => `https://github.com/acme/skills-${i + 1}`,
    );
  const openRepositories = async () =>
    userEvent.click(screen.getByRole('button', { name: /Repository/ }));

  it('offers three repositories without a search', async () => {
    mockRepositories = repos(3);
    await renderPage();

    await openRepositories();
    expect(
      await screen.findByRole('option', { name: 'acme/skills-3' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('offers type-ahead over 300 repositories', async () => {
    mockRepositories = repos(300);
    await renderPage();

    await openRepositories();
    expect(await screen.findByRole('searchbox')).toBeInTheDocument();
  });
});

describe('AddSkillPage editing an existing skill', () => {
  it('opens prefilled from the SKILL.md, with the name fixed and Cancel back to the skill', async () => {
    await renderPage(edit);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit skill' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Customize / Skills / ticket-triage'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /support\/ticket-triage\/SKILL.md in giantswarm\/skills/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toHaveAttribute('readonly');
    await waitFor(() =>
      expect(document.title).toBe('Edit ticket-triage · Skills'),
    );
    expect(screen.getByLabelText(/Name/)).toHaveValue('ticket-triage');
    expect(screen.getByLabelText(/Description/)).toHaveValue('How to triage.');
    expect(screen.getByLabelText(/Instructions/)).toHaveValue(
      'Classify, prioritise, route.',
    );
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      edit.skillHref,
    );
    // Nothing changed yet: nothing to propose.
    expect(
      screen.getByRole('button', { name: 'Open pull request' }),
    ).toBeDisabled();
  });

  it('proposes the change as an update of the skill directory', async () => {
    const user = userEvent.setup();
    await renderPage(edit);

    await user.type(screen.getByLabelText(/Instructions/), ' Then close.');
    await user.click(screen.getByRole('button', { name: 'Open pull request' }));

    expect(proposeSkill).toHaveBeenCalledWith({
      repoUrl: REPO,
      skillName: 'ticket-triage',
      description: 'How to triage.',
      instructions: 'Classify, prioritise, route. Then close.',
      kind: 'update',
      path: 'support/ticket-triage',
      baseCommit: COMMIT,
    });
  }, 30_000);

  it('ends on the opened pull request, like adding one', async () => {
    mockState = {
      isProposing: false,
      error: null,
      result: {
        ...opened,
        branch: 'update-skill/ticket-triage',
        path: 'support/ticket-triage/SKILL.md',
      },
    };
    await renderPage(edit);

    expect(screen.getByText('Pull request #7 opened')).toBeInTheDocument();
    expect(
      screen.getByText(/A teammate reviews and approves it/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /the change reaches the catalog once the pull request merges/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Open the pull request/ }),
    ).toHaveAttribute('href', opened.pullRequestUrl);
  });
});
