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

function agent(technicalName: string, skillIds: string[]): AgentRow {
  return {
    id: `gazelle/kagent/${technicalName}`,
    installation: 'gazelle',
    namespace: 'kagent',
    name: technicalName,
    technicalName,
    description: '',
    skillCount: skillIds.length,
    skillIds,
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
  mockCatalog = loaded;
  mockRows = [];
  mockUnreachable = [];
  mockEvaluator = undefined;
  mockCreationError = null;
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
    mockRows = [
      agent('triage-bot', [`${REPO}#ticket-triage`]),
      agent('other-bot', []),
    ];
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

    // Used by: only the agent that mounts the skill, its row opening its page.
    expect(screen.getByText('Used by 1 agent')).toBeInTheDocument();
    await userEvent.click(screen.getByText('triage-bot'));
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/agents/gazelle/kagent/triage-bot',
      undefined,
    );
    expect(screen.queryByText('other-bot')).not.toBeInTheDocument();
    // The honest update affordance: pins live on agents, not here.
    expect(
      screen.getByText(/Each agent pins the skill to a commit/),
    ).toBeInTheDocument();
  }, 30_000);

  it('offers no Evaluate while the Skill Evaluator role is unresolved', async () => {
    await renderPage();

    expect(
      screen.queryByRole('button', { name: 'Evaluate' }),
    ).not.toBeInTheDocument();
  });

  it('offers Edit, opening the add-skill flow for this skill', async () => {
    await renderPage();

    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
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
      screen.queryByRole('link', { name: 'Edit' }),
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

    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(
      screen.queryByText("The portal cannot read this skill's source"),
    ).not.toBeInTheDocument();
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
