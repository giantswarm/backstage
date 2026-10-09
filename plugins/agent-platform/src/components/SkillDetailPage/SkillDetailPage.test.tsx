import { Route, Routes } from 'react-router-dom';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import { agentsRouteRef, sessionsRouteRef, skillsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
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
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: () => ({
    createSession,
    isCreating: false,
    error: null,
    reset: jest.fn(),
  }),
}));

// The composer drags in the full picker; the dialog's own wiring is what this
// page test covers.
jest.mock('./EvaluateSkillDialog', () => ({
  ...jest.requireActual('./EvaluateSkillDialog'),
  EvaluateSkillDialog: ({
    isOpen,
    evaluator,
  }: {
    isOpen: boolean;
    evaluator: AgentRow;
  }) => (isOpen ? <div>Evaluate dialog with {evaluator.name}</div> : null),
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
  createSession.mockReset();
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

  it('offers Evaluate when the role resolves, opening the evaluation dialog', async () => {
    mockEvaluator = agent('skill-evaluator', []);
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'Evaluate' }));

    expect(
      screen.getByText('Evaluate dialog with skill-evaluator'),
    ).toBeInTheDocument();
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
