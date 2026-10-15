import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import type { SkillPullRequest } from '../../hooks/useProposeSkill';
import { sessionsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { skillCreationPrompt } from '../SkillCreationAssist';
import { AddSkillPage, type SkillEdit } from './AddSkillPage';

const REPO = 'https://github.com/giantswarm/skills';

let mockRepositories: string[] = [];
let mockMetaAgents: Record<string, string | undefined> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptionalStringArray: () => mockRepositories,
      getOptionalString: (key: string) =>
        mockMetaAgents[key.replace('agentPlatform.metaAgents.', '')],
    },
    isLoading: false,
  }),
}));

// The skill creator hand-off (T78): the agents it resolves the role against,
// and the session it starts.
const mockSkillCreator = {
  id: 'gazelle/kagent/skill-creator',
  installation: 'gazelle',
  namespace: 'kagent',
  name: 'Skill Creator',
  technicalName: 'skill-creator',
  description: '',
  skillCount: 0,
  readiness: 'ready',
} as AgentRow;
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAgents: () => ({ rows: [mockSkillCreator], isLoading: false }),
}));
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));
const createSession = jest.fn();
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: () => ({
    createSession,
    isCreating: false,
    error: null,
    reset: jest.fn(),
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
    { mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef } },
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
  mockMetaAgents = {};
  createSession.mockReset();
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

  it('explains the pull request and the fields', async () => {
    await renderPage();

    expect(
      screen.getByText(
        'This opens a pull request. The skill reaches the catalog once a teammate merges it.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Use lowercase letters, digits and dashes, e.g. ticket-triage.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Write what the agent should know and do. Markdown formatting allowed.',
      ),
    ).toBeInTheDocument();
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
      expect.stringContaining('Enter a description.'),
    );
    expect(description).toHaveFocus();
    const instructions = screen.getByLabelText(/Instructions/);
    expect(instructions).toHaveAttribute('aria-invalid', 'true');
    expect(instructions).toHaveAccessibleDescription(
      expect.stringContaining('Enter the instructions.'),
    );
    expect(screen.getByLabelText(/Name/)).not.toHaveAttribute('aria-invalid');
  }, 30_000);

  it('says what is wrong with a name once the person leaves it, and clears it as it is fixed', async () => {
    const user = userEvent.setup();
    await renderPage();

    const name = screen.getByLabelText(/Name/);
    await user.type(name, 'Notes');
    // Not while it is typed.
    expect(name).not.toHaveAttribute('aria-invalid');

    await user.tab();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(
      expect.stringContaining('lowercase letters, digits and dashes'),
    );

    await user.clear(name);
    await user.type(name, 'notes');
    expect(name).not.toHaveAttribute('aria-invalid');
  }, 30_000);

  it('says nothing about an empty name that was only tabbed through', async () => {
    const user = userEvent.setup();
    await renderPage();

    await user.click(screen.getByLabelText(/Name/));
    await user.tab();

    expect(
      screen.queryByText('Enter a name for the skill.'),
    ).not.toBeInTheDocument();
  }, 30_000);

  it('shows the opened pull request and what happens next, with Done to leave', async () => {
    mockState = { isProposing: false, error: null, result: opened };
    await renderPage();

    expect(screen.getByText('Pull request #7 opened')).toBeInTheDocument();
    expect(
      screen.getByText(
        /A teammate has to merge it before the skill reaches the catalog/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Review pull request/ }),
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

  it('offers only github.com repositories, and says why the others are missing', async () => {
    mockRepositories = ['http://gitea.lab.local/lab/skills', REPO];
    await renderPage();

    // One target left, so no select: the GitHub one, named.
    expect(
      screen.getByText(
        `Repository: ${REPO.replace('https://github.com/', '')}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Only github.com repositories are offered/),
    ).toBeInTheDocument();
  });

  it('has nothing to propose to when no configured repository is on github.com', async () => {
    mockRepositories = ['http://gitea.lab.local/lab/skills'];
    await renderPage();

    expect(screen.getByText('No repository to propose to')).toBeInTheDocument();
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
    expect(
      screen.getByText(
        'This opens a pull request. The change reaches the catalog once a teammate merges it; agents keep their pinned version until their skills are updated.',
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

  it('lists the files that stay as they are, linking the viewer and GitHub, for a multi-file skill', async () => {
    await renderPage({
      ...edit,
      content: {
        ...edit.content,
        files: [
          { path: 'SKILL.md', size: 10, sha: 'a' },
          { path: 'references/setup.md', size: 20, sha: 'b' },
        ],
      },
    });

    expect(screen.getByText('This file stays as it is')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'references/setup.md' }),
    ).toHaveAttribute(
      'href',
      `${edit.skillHref}/instructions?file=references/setup.md`,
    );
    expect(
      screen.getByRole('link', { name: 'Edit on GitHub ↗' }),
    ).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/tree/${COMMIT}/support/ticket-triage`,
    );
  });

  it('warns while typing a link to a file the skill does not have', async () => {
    const user = userEvent.setup();
    await renderPage({
      ...edit,
      content: {
        ...edit.content,
        files: [
          { path: 'SKILL.md', size: 10, sha: 'a' },
          { path: 'references/setup.md', size: 20, sha: 'b' },
        ],
      },
    });

    expect(screen.queryByText(/does not have/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Instructions/), ' {[}x](gone.md)');
    expect(
      screen.getByText(
        'The instructions link to files the skill does not have: gone.md',
      ),
    ).toBeInTheDocument();
  }, 30_000);

  it('shows no file list for a single-file skill or an unlisted one', async () => {
    const { unmount } = await renderPage(edit);
    expect(screen.queryByText(/stay as/)).not.toBeInTheDocument();
    unmount();

    await renderPage({
      ...edit,
      content: {
        ...edit.content,
        files: [{ path: 'SKILL.md', size: 10, sha: 'a' }],
      },
    });
    expect(screen.queryByText(/stay as/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Edit on GitHub/)).not.toBeInTheDocument();
  });

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
      screen.getByText(
        /A teammate has to merge it before the change reaches the catalog/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Review pull request/ }),
    ).toHaveAttribute('href', opened.pullRequestUrl);
  });
});

describe('AddSkillPage · the skill creator hand-off', () => {
  const caveat =
    'This form is for simple skills; for complex, multi-file ones, start a session with Skill Creator, which continues from what you typed.';

  it('is absent while the skillCreation role is unconfigured', async () => {
    await renderPage();

    expect(screen.queryByText(caveat)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Create with Skill Creator' }),
    ).not.toBeInTheDocument();
  });

  it('is absent from an edit while the role is unconfigured', async () => {
    await renderPage(edit);

    expect(screen.queryByText(caveat)).not.toBeInTheDocument();
  });

  it('shows the caveat above the add form and hands the typed skill over', async () => {
    mockMetaAgents = { skillCreation: 'kagent/skill-creator' };
    createSession.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderPage();

    const strip = screen.getByRole('region', {
      name: 'Write complex skills with Skill Creator',
    });
    expect(strip).toHaveTextContent(caveat);
    await user.type(screen.getByLabelText(/Name/), 'notes');
    await user.click(
      screen.getByRole('button', { name: 'Create with Skill Creator' }),
    );

    expect(createSession).toHaveBeenCalledWith({
      agent: mockSkillCreator,
      prompt: skillCreationPrompt({
        kind: 'create',
        repoUrl: REPO,
        name: 'notes',
        description: '',
        instructions: '',
      }),
    });
  }, 30_000);

  it('carries the typed instructions of a new skill into the first message', async () => {
    mockMetaAgents = { skillCreation: 'kagent/skill-creator' };
    createSession.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderPage();

    await user.type(screen.getByLabelText(/Instructions/), 'Take notes.');
    await user.click(
      screen.getByRole('button', { name: 'Create with Skill Creator' }),
    );

    expect(createSession.mock.calls[0][0].prompt).toContain(
      '```markdown\nTake notes.\n```',
    );
  }, 30_000);

  it('carries instructions rewritten on an edit, but not the unchanged ones', async () => {
    mockMetaAgents = { skillCreation: 'kagent/skill-creator' };
    createSession.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderPage(edit);

    await user.type(screen.getByLabelText(/Instructions/), ' Then close.');
    await user.click(
      screen.getByRole('button', { name: 'Edit with Skill Creator' }),
    );

    expect(createSession.mock.calls[0][0].prompt).toContain(
      '```markdown\nClassify, prioritise, route. Then close.\n```',
    );
  }, 30_000);

  it('carries a description rewritten on an edit', async () => {
    mockMetaAgents = { skillCreation: 'kagent/skill-creator' };
    createSession.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderPage(edit);

    await user.type(screen.getByLabelText(/Description/), ' Fast.');
    await user.click(
      screen.getByRole('button', { name: 'Edit with Skill Creator' }),
    );

    expect(createSession.mock.calls[0][0].prompt).toContain(
      '```markdown\nHow to triage. Fast.\n```',
    );
  }, 30_000);

  it('shows the caveat on an edit and hands the skill being changed over', async () => {
    mockMetaAgents = { skillCreation: 'kagent/skill-creator' };
    createSession.mockReturnValue(new Promise(() => {}));
    await renderPage(edit);

    expect(screen.getByText(caveat)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: 'Edit with Skill Creator' }),
    );

    expect(createSession).toHaveBeenCalledWith({
      agent: mockSkillCreator,
      prompt: skillCreationPrompt({ kind: 'update', skill: edit.skill }),
    });
  }, 30_000);

  it('is gone once the pull request is open', async () => {
    mockMetaAgents = { skillCreation: 'kagent/skill-creator' };
    mockState = { isProposing: false, error: null, result: opened };
    await renderPage();

    expect(screen.queryByText(caveat)).not.toBeInTheDocument();
  });
});
