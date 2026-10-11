import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import { agentsRouteRef, sessionsRouteRef, skillsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { evaluationPrompt } from './evaluationPrompt';
import { SkillDetailPage } from './SkillDetailPage';

const REPO = 'https://github.com/giantswarm/skills';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const skill = {
  name: 'Ticket triage',
  description: 'How to classify, prioritise and route a support ticket.',
  repoUrl: REPO,
  path: 'ticket-triage',
  ref: 'main',
  commit: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
};

let mockCatalog: SkillCatalog;
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => mockCatalog,
}));

let mockRows: AgentRow[] = [];
let mockUnreachable: string[] = [];
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({
    rows: mockRows,
    isLoading: false,
    unreachableInstallations: mockUnreachable,
  }),
}));

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));

let mockEvaluator: AgentRow | undefined;
jest.mock('../../hooks/useMetaAgent', () => ({
  useMetaAgent: (role: string) =>
    role === 'skillEvaluation' ? mockEvaluator : undefined,
}));

let mockContent: {
  content?: { commit: string; instructions: string };
  isLoading: boolean;
  error: Error | null;
} = { isLoading: false, error: null };
const mockUseSkillContent = jest.fn();
jest.mock('../../hooks/useSkillContent', () => ({
  useSkillContent: (target: unknown) => {
    mockUseSkillContent(target);
    return mockContent;
  },
}));

const mockUpdateDialog = jest.fn();
jest.mock('./SkillUpdateAgentsDialog', () => ({
  // The dialog has its own suite; here only what the page hands it.
  SkillUpdateAgentsDialog: (props: {
    head: string;
    behind: { row: { name: string }; pinned: string }[];
  }) => {
    mockUpdateDialog(props);
    return require('react').createElement(
      'div',
      { 'data-testid': 'update-agents-dialog' },
      props.behind.map(item => `${item.row.name}@${item.pinned}`).join(','),
    );
  },
}));

const createSession = jest.fn();
let mockCreationError: Error | null = null;
const mockUseCreateSession = jest.fn();
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: (entryPoint: string) => {
    mockUseCreateSession(entryPoint);
    return {
      createSession,
      isCreating: false,
      error: mockCreationError,
      reset: jest.fn(),
    };
  },
}));

const OLD_COMMIT = 'cb1fb768ba1d1b1e62c6e0b32c39a6b4bd3b58a1';

/** An agent mounting `skillIds`, each pinned at `pin` (the catalog's head unless said). */
function agent(
  technicalName: string,
  skillIds: string[],
  pin: string = skill.commit,
): AgentRow {
  return {
    id: `gazelle/kagent/${technicalName}`,
    installation: 'gazelle',
    namespace: 'kagent',
    name: technicalName,
    technicalName,
    description: '',
    skillCount: skillIds.length,
    skillIds,
    skillPins: Object.fromEntries(skillIds.map(id => [id, pin])),
    readiness: 'ready',
  } as AgentRow;
}

const loaded: SkillCatalog = {
  skills: [skill],
  isLoading: false,
  error: null,
  hasRepositories: true,
  failedRepositories: [],
  truncated: false,
};

function renderPage(path = 'giantswarm/skills/ticket-triage') {
  return renderInTestApp(
    <Routes>
      <Route path="/agent-platform/skills/*" element={<SkillDetailPage />} />
    </Routes>,
    {
      initialRouteEntries: [`/agent-platform/skills/${path}`],
      mountedRoutes: {
        '/agent-platform/skills': skillsRouteRef,
        '/agent-platform/sessions': sessionsRouteRef,
        '/agent-platform/agents': agentsRouteRef,
      },
    },
  );
}

beforeEach(() => {
  mockUpdateDialog.mockReset();
  mockCatalog = loaded;
  mockRows = [];
  mockUnreachable = [];
  mockEvaluator = undefined;
  mockCreationError = null;
  mockContent = { isLoading: false, error: null };
  mockUseSkillContent.mockReset();
  createSession.mockReset();
  mockNavigate.mockReset();
});

describe('evaluationPrompt', () => {
  it('names the skill, where it lives at which commit, and asks for a report and a PR', () => {
    const prompt = evaluationPrompt(skill);

    expect(prompt).toContain('"Ticket triage"');
    expect(prompt).toContain(REPO);
    expect(prompt).toContain('ticket-triage/SKILL.md');
    expect(prompt).toContain(skill.commit);
    expect(prompt).toContain('branch main');
    expect(prompt).toMatch(/evaluation report/);
    expect(prompt).toMatch(/pull request/);
  });

  it('names the root SKILL.md for a skill at the repository root', () => {
    expect(evaluationPrompt({ ...skill, path: '' })).toContain(
      'file SKILL.md,',
    );
  });
});

describe('SkillDetailPage', () => {
  it('shows the skill from the list data: name, description, source and pin', async () => {
    await renderPage();

    expect(
      screen.getByRole('heading', { name: 'Ticket triage' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'How to classify, prioritise and route a support ticket.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('ticket-triage/SKILL.md')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'a1b2c3d' })).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/commit/${skill.commit}`,
    );
    expect(screen.getByRole('link', { name: /View source/ })).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/tree/${skill.commit}/ticket-triage`,
    );
    // The Overview reads nothing more than the listing has.
    expect(mockUseSkillContent).not.toHaveBeenCalled();
  });

  it('draws Agent detail’s routed tabs below the skill’s own address', async () => {
    mockRows = [agent('triage-bot', [`${REPO}#ticket-triage`])];
    await renderPage();

    expect(
      screen
        .getAllByRole('tab')
        .map(tab => [tab.textContent, tab.getAttribute('href')]),
    ).toEqual([
      ['Overview', '/agent-platform/skills/giantswarm/skills/ticket-triage'],
      [
        'Instructions',
        '/agent-platform/skills/giantswarm/skills/ticket-triage/instructions',
      ],
      [
        'Used by (1)',
        '/agent-platform/skills/giantswarm/skills/ticket-triage/used-by',
      ],
    ]);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Overview',
    );
  });

  it('lists the agents using the skill on the Used by tab', async () => {
    mockRows = [
      agent('triage-bot', [`${REPO}#ticket-triage`]),
      agent('other-bot', []),
    ];
    await renderPage('giantswarm/skills/ticket-triage/used-by');

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Used by (1)',
    );
    // Used by: only the agent that mounts the skill, its row opening its page.
    expect(screen.getByText('Used by 1 agent')).toBeInTheDocument();
    await userEvent.click(screen.getByText('triage-bot'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/agents/gazelle/kagent/triage-bot',
      undefined,
    );
    expect(screen.queryByText('other-bot')).not.toBeInTheDocument();
    // Nobody behind: a quiet line, and no Update agents action.
    expect(
      screen.getByText('All agents use the newest version (a1b2c3d).'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Update agents' }),
    ).not.toBeInTheDocument();
    // The facts belong to the Overview.
    expect(
      screen.queryByText('ticket-triage/SKILL.md'),
    ).not.toBeInTheDocument();
  }, 30_000);

  it('offers Update agents when some agents pin an older commit, and hands the dialog exactly those', async () => {
    mockRows = [
      agent('current-bot', [`${REPO}#ticket-triage`]),
      agent('stale-bot', [`${REPO}#ticket-triage`], OLD_COMMIT),
      // Behind on another skill only: not this page's business.
      agent('elsewhere-bot', [`${REPO}#other`], OLD_COMMIT),
    ];
    await renderPage('giantswarm/skills/ticket-triage/used-by');

    // The behind row says so; the line under the list counts them.
    expect(screen.getByText(/older version \(cb1fb76\)/)).toBeInTheDocument();
    expect(
      screen.getByText(
        'One agent pins an older commit than the newest (a1b2c3d). Update agents moves it there.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('update-agents-dialog'),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Update agents' }),
    );

    expect(screen.getByTestId('update-agents-dialog')).toHaveTextContent(
      `stale-bot@${OLD_COMMIT}`,
    );
    expect(mockUpdateDialog).toHaveBeenLastCalledWith(
      expect.objectContaining({ head: skill.commit }),
    );
    expect(
      mockUpdateDialog.mock.calls
        .at(-1)![0]
        .behind.map((item: { row: { name: string } }) => item.row.name),
    ).toEqual(['stale-bot']);
  }, 30_000);

  it('treats an abbreviated pin of the head as current', async () => {
    mockRows = [
      agent('short-bot', [`${REPO}#ticket-triage`], skill.commit.slice(0, 12)),
    ];
    await renderPage();

    expect(
      screen.queryByRole('button', { name: 'Update agents' }),
    ).not.toBeInTheDocument();
  });

  it('windows a long Used by list', async () => {
    mockRows = Array.from({ length: 300 }, (_, index) =>
      agent(`bot-${String(index).padStart(3, '0')}`, [`${REPO}#ticket-triage`]),
    );
    await renderPage('giantswarm/skills/ticket-triage/used-by');

    expect(screen.getByText('Used by 300 agents')).toBeInTheDocument();
    expect(screen.getByText('bot-000')).toBeInTheDocument();
    expect(screen.queryByText('bot-299')).not.toBeInTheDocument();
  }, 30_000);

  it('renders the SKILL.md instructions on the Instructions tab, without raw HTML', async () => {
    mockContent = {
      isLoading: false,
      error: null,
      content: {
        commit: skill.commit,
        instructions: [
          '## When to use',
          '',
          'Read [the setup](references/setup.md) and [the docs](https://example.com/docs).',
          '',
          '<script>window.pwned = true</script><b data-testid="raw">raw</b>',
          '',
          '![diagram](img/flow.png)',
        ].join('\n'),
      },
    };
    await renderPage('giantswarm/skills/ticket-triage/instructions');

    expect(mockUseSkillContent).toHaveBeenCalledWith(skill);
    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Instructions',
    );
    expect(
      screen.getByRole('heading', { name: 'When to use' }),
    ).toBeInTheDocument();
    // A relative link points into the skill's folder at the pinned commit.
    expect(screen.getByRole('link', { name: /the setup/ })).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/tree/${skill.commit}/ticket-triage/references/setup.md`,
    );
    expect(screen.getByRole('link', { name: /the docs/ })).toHaveAttribute(
      'href',
      'https://example.com/docs',
    );
    // Raw HTML is dropped, not rendered; an image is a link, not a load.
    const instructions = screen.getByTestId('skill-instructions');
    expect(instructions.querySelector('script')).toBeNull();
    expect(screen.queryByTestId('raw')).not.toBeInTheDocument();
    expect(instructions.querySelector('img')).toBeNull();
    expect(
      screen.getByRole('link', { name: /Image: diagram/ }),
    ).toHaveAttribute(
      'href',
      `https://github.com/giantswarm/skills/tree/${skill.commit}/ticket-triage/img/flow.png`,
    );
  }, 30_000);

  it('says so when the instructions could not be read', async () => {
    mockContent = { isLoading: false, error: new Error('HTTP 409') };
    await renderPage('giantswarm/skills/ticket-triage/instructions');

    expect(
      screen.getByText('Could not read the instructions'),
    ).toBeInTheDocument();
    expect(screen.getByText('HTTP 409')).toBeInTheDocument();
  });

  it('offers no Evaluate while the Skill Evaluator role is unresolved', async () => {
    await renderPage();

    expect(
      screen.queryByRole('button', { name: 'Evaluate' }),
    ).not.toBeInTheDocument();
  });

  it('offers Edit as a header button, opening the add-skill flow for this skill', async () => {
    mockEvaluator = agent('skill-evaluator', []);
    await renderPage();

    // Agent detail's header actions: secondary first, the primary last.
    const edit = screen.getByRole('button', { name: 'Edit' });
    expect(edit.parentElement).toBe(
      screen.getByRole('button', { name: 'Evaluate' }).parentElement,
    );
    expect(
      Array.from(edit.parentElement!.children).map(child => child.textContent),
    ).toEqual(['Edit', 'View source ↗', 'Evaluate']);

    await userEvent.click(edit);
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/skills/edit/giantswarm/skills/ticket-triage',
    );
  });

  it('offers no Edit for a skill the portal could not read, and says so; Evaluate stays', async () => {
    mockCatalog = { ...loaded, skills: [{ ...skill, contentReadable: false }] };
    mockEvaluator = agent('skill-evaluator', []);
    await renderPage();

    expect(
      screen.getByRole('heading', { name: 'Ticket triage' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The portal cannot read this skill's source"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    // Nothing to show on an Instructions tab either.
    expect(
      screen.queryByRole('tab', { name: 'Instructions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Evaluate' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /View source/ }),
    ).toBeInTheDocument();
  });

  it('says nothing about the source of a readable skill', async () => {
    mockCatalog = { ...loaded, skills: [{ ...skill, contentReadable: true }] };
    await renderPage();

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(
      screen.queryByText("The portal cannot read this skill's source"),
    ).not.toBeInTheDocument();
  });

  it('sends the Instructions tab of an unreadable skill to its Overview', async () => {
    mockCatalog = { ...loaded, skills: [{ ...skill, contentReadable: false }] };
    await renderPage('giantswarm/skills/ticket-triage/instructions');

    expect(screen.getByRole('tab', { selected: true })).toHaveTextContent(
      'Overview',
    );
    expect(mockUseSkillContent).not.toHaveBeenCalled();
  });

  it('shows a skill outside github.com read-only: no Edit, no Evaluate, and why', async () => {
    const gitSkill = {
      ...skill,
      repoUrl: 'http://gitea.lab.local/lab/skills',
    };
    mockCatalog = { ...loaded, skills: [gitSkill] };
    mockEvaluator = agent('skill-evaluator', []);
    await renderPage('-/gitea.lab.local/lab/skills/-/ticket-triage');

    expect(
      screen.getByRole('heading', { name: 'Ticket triage' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Read-only in the portal')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Edit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Evaluate' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /View source/ }),
    ).not.toBeInTheDocument();
    // Readable all the same: its instructions are a tab away.
    expect(screen.getByRole('tab', { name: 'Instructions' })).toHaveAttribute(
      'href',
      '/agent-platform/skills/-/gitea.lab.local/lab/skills/-/ticket-triage/instructions',
    );
  });

  it('starts an evaluation session with the evaluator and opens it', async () => {
    mockEvaluator = agent('skill-evaluator', []);
    createSession.mockResolvedValue('session-1');
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    expect(mockUseCreateSession).toHaveBeenCalledWith('skillDetail');
    const prompt = evaluationPrompt(skill);
    expect(createSession).toHaveBeenCalledWith({
      agent: mockEvaluator,
      prompt,
    });
    // The standard handoff: the session page sends the first message.
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/sessions/gazelle/session-1',
      {
        state: {
          newSession: {
            text: prompt,
            agentNamespace: 'kagent',
            agentName: 'skill-evaluator',
          },
        },
      },
    );
  }, 30_000);

  it('stays on the page and says why when the session could not start', async () => {
    mockEvaluator = agent('skill-evaluator', []);
    mockCreationError = new Error('kagent is unreachable');
    createSession.mockRejectedValue(mockCreationError);
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByText('Could not start the evaluation'),
    ).toBeInTheDocument();
    expect(screen.getByText('kagent is unreachable')).toBeInTheDocument();
  }, 30_000);

  it('says when no skill exists at the address', async () => {
    await renderPage('giantswarm/skills/gone');

    expect(screen.getByText('Skill not found')).toBeInTheDocument();
  });

  it('does not claim a skill is missing while the repositories were unreadable', async () => {
    mockCatalog = {
      ...loaded,
      skills: [],
      failedRepositories: [REPO],
    };
    await renderPage();

    expect(
      screen.getByText('Could not read the skill repositories'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Skill not found')).not.toBeInTheDocument();
  });
});
