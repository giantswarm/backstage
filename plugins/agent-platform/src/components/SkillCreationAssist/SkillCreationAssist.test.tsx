import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';

import { sessionsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { SkillCreationAssist } from './SkillCreationAssist';
import {
  skillCreationPrompt,
  type SkillCreationTarget,
} from './skillCreationPrompt';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

let configuredRoles: Record<string, string | undefined> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptionalString: (key: string) =>
        configuredRoles[key.replace('agentPlatform.metaAgents.', '')],
    },
    isLoading: false,
  }),
}));

let mockRows: AgentRow[] = [];
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAgents: () => ({ rows: mockRows, isLoading: false }),
}));

jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));

const createSession = jest.fn();
const mockUseCreateSession = jest.fn();
let mockCreationError: Error | null = null;
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

function agent(
  technicalName: string,
  name = technicalName,
  readiness: AgentRow['readiness'] = 'ready',
): AgentRow {
  return {
    id: `gazelle/kagent/${technicalName}`,
    installation: 'gazelle',
    namespace: 'kagent',
    name,
    technicalName,
    description: '',
    skillCount: 0,
    readiness,
  } as AgentRow;
}

const CREATE: SkillCreationTarget = {
  kind: 'create',
  repoUrl: 'https://github.com/giantswarm/skills',
  name: 'notes',
  description: '',
};

function renderAssist(target: SkillCreationTarget = CREATE) {
  return renderInTestApp(<SkillCreationAssist getTarget={() => target} />, {
    mountedRoutes: { '/agent-platform/sessions': sessionsRouteRef },
  });
}

beforeEach(() => {
  configuredRoles = {};
  mockRows = [agent('swarm-operator'), agent('skill-creator', 'Skill Creator')];
  mockCreationError = null;
  createSession.mockReset();
  mockNavigate.mockReset();
  mockUseCreateSession.mockReset();
});

describe('SkillCreationAssist', () => {
  it('renders nothing while the skillCreation role is unconfigured', async () => {
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Rather let an agent write it?'),
    ).not.toBeInTheDocument();
  });

  it('renders nothing when the configured agent does not exist', async () => {
    configuredRoles = { skillCreation: 'gone-agent' };
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing when the configured agent cannot take a session', async () => {
    configuredRoles = { skillCreation: 'skill-creator' };
    mockRows = [agent('skill-creator', 'Skill Creator', 'notReady')];
    await renderAssist();

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the caveat and the hand-off where the role resolves', async () => {
    configuredRoles = { skillCreation: 'skill-creator' };
    await renderAssist();

    const strip = screen.getByRole('region', {
      name: 'Write complex skills with Skill Creator',
    });
    expect(strip).toHaveTextContent('Rather let an agent write it?');
    expect(strip).toHaveTextContent(
      'This form is for simple skills; for complex, multi-file ones, work with Skill Creator.',
    );
    expect(
      screen.getByRole('button', { name: 'Let Skill Creator help' }),
    ).toBeInTheDocument();
  });

  it('starts a session with the skill creator and opens it', async () => {
    configuredRoles = { skillCreation: 'kagent/skill-creator' };
    createSession.mockResolvedValue('session-9');
    await renderAssist();

    await userEvent.click(
      screen.getByRole('button', { name: 'Let Skill Creator help' }),
    );

    expect(mockUseCreateSession).toHaveBeenCalledWith('skillCreationAssist');
    const prompt = skillCreationPrompt(CREATE);
    expect(createSession).toHaveBeenCalledWith({
      agent: mockRows[1],
      prompt,
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/agent-platform/sessions/gazelle/session-9',
      {
        state: {
          newSession: {
            text: prompt,
            agentNamespace: 'kagent',
            agentName: 'skill-creator',
          },
        },
      },
    );
  }, 30_000);

  it('stays on the form and says why when the session could not start', async () => {
    configuredRoles = { skillCreation: 'skill-creator' };
    mockCreationError = new Error('kagent is unreachable');
    createSession.mockRejectedValue(mockCreationError);
    await renderAssist();

    await userEvent.click(
      screen.getByRole('button', { name: 'Let Skill Creator help' }),
    );

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByText('Could not start a session with Skill Creator'),
    ).toBeInTheDocument();
    expect(screen.getByText('kagent is unreachable')).toBeInTheDocument();
  }, 30_000);
});

describe('skillCreationPrompt', () => {
  it('names the repository, what was typed, and asks for the purpose first', () => {
    const prompt = skillCreationPrompt({
      kind: 'create',
      repoUrl: 'https://github.com/giantswarm/skills',
      name: ' notes ',
      description: 'Take notes.',
    });
    expect(prompt).toContain(
      'create a new skill in https://github.com/giantswarm/skills',
    );
    expect(prompt).toContain('Its name: notes.');
    expect(prompt).toContain('What it is for, so far: Take notes.');
    expect(prompt).toContain(
      'Ask me what the skill is for before you write anything.',
    );
    expect(prompt).toContain('pull request');
  });

  it('leaves out what was not typed', () => {
    const prompt = skillCreationPrompt({
      kind: 'create',
      repoUrl: 'https://github.com/giantswarm/skills',
    });
    expect(prompt).not.toContain('Its name');
    expect(prompt).not.toContain('so far');
  });

  it('carries typed instructions in a fenced block, and leaves the block out when there are none', () => {
    const create = {
      kind: 'create' as const,
      repoUrl: 'https://github.com/giantswarm/skills',
      name: 'notes',
    };
    const prompt = skillCreationPrompt({
      ...create,
      instructions: '  # Notes\n\nTake notes.  ',
    });
    expect(prompt).toContain(
      'continue from them:\n\n```markdown\n# Notes\n\nTake notes.\n```',
    );
    expect(prompt).toContain('Ask me what is missing before you write');
    for (const none of [undefined, '', '   ']) {
      const without = skillCreationPrompt({ ...create, instructions: none });
      expect(without).not.toContain('```');
      expect(without).toContain('Ask me what the skill is for');
    }
  });

  it('fences instructions that contain code fences with a longer fence', () => {
    const prompt = skillCreationPrompt({
      kind: 'create',
      repoUrl: 'https://github.com/giantswarm/skills',
      instructions: 'Run:\n\n```sh\nls\n```',
    });
    expect(prompt).toContain('````markdown\nRun:\n\n```sh\nls\n```\n````');
  });

  it('carries rewritten instructions of a skill being changed', () => {
    const skill = {
      name: 'ticket-triage',
      repoUrl: 'https://github.com/giantswarm/skills',
      path: 'support/ticket-triage',
      commit: 'a1b2c3d',
      ref: 'main',
    };
    expect(
      skillCreationPrompt({ kind: 'update', skill, instructions: 'New body.' }),
    ).toContain('continue from them:\n\n```markdown\nNew body.\n```');
    expect(skillCreationPrompt({ kind: 'update', skill })).not.toContain('```');
  });

  it('names the skill being changed exactly', () => {
    const prompt = skillCreationPrompt({
      kind: 'update',
      skill: {
        name: 'ticket-triage',
        repoUrl: 'https://github.com/giantswarm/skills',
        path: 'support/ticket-triage',
        commit: 'a1b2c3d',
        ref: 'main',
      },
    });
    expect(prompt).toContain(
      'It lives in https://github.com/giantswarm/skills, file support/ticket-triage/SKILL.md, at commit a1b2c3d (branch main).',
    );
    expect(prompt).toContain('ask me what should change');
    expect(prompt).toContain('pull request against main');
  });
});
