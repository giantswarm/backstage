import { Route, Routes } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import { PageHeaderActionsProvider } from '@giantswarm/backstage-plugin-ui-react';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import type { SkillContent } from '../../hooks/useSkillContent';
import { skillsRouteRef } from '../../routes';
import { EditSkillPage } from './EditSkillPage';

const REPO = 'https://github.com/giantswarm/skills';
const COMMIT = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';

const skill = {
  name: 'ticket-triage',
  description: 'How to triage.',
  repoUrl: REPO,
  path: 'support/ticket-triage',
  ref: 'main',
  commit: COMMIT,
};

let mockCatalog: SkillCatalog;
jest.mock('../../hooks/useSkillCatalog', () => ({
  useSkillCatalog: () => mockCatalog,
}));

let mockContent: {
  content?: SkillContent;
  isLoading: boolean;
  error: Error | null;
};
const mockUseSkillContent = jest.fn();
jest.mock('../../hooks/useSkillContent', () => ({
  useSkillContent: (target: unknown) => {
    mockUseSkillContent(target);
    return mockContent;
  },
}));

let mockMetaAgents: Record<string, string | undefined> = {};
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: {
      getOptionalStringArray: () => [REPO],
      getOptionalString: (key: string) =>
        mockMetaAgents[key.replace('agentPlatform.metaAgents.', '')],
    },
    isLoading: false,
  }),
}));

// The skill creator hand-off (T78) above the form.
jest.mock('../AgentsDataProvider', () => ({
  AgentsDataProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useAgents: () => ({
    rows: [
      {
        id: 'gazelle/kagent/skill-creator',
        installation: 'gazelle',
        namespace: 'kagent',
        name: 'Skill Creator',
        technicalName: 'skill-creator',
        description: '',
        skillCount: 0,
        readiness: 'ready',
      },
    ],
    isLoading: false,
  }),
}));
jest.mock('../../hooks/useAgentAvatarUrl', () => ({
  useAgentAvatarUrl: () => () => undefined,
}));
jest.mock('../../hooks/useCreateSession', () => ({
  useCreateSession: () => ({
    createSession: jest.fn(),
    isCreating: false,
    error: null,
    reset: jest.fn(),
  }),
}));

jest.mock('../../hooks/useProposeSkill', () => ({
  ...jest.requireActual('../../hooks/useProposeSkill'),
  useProposeSkill: () => ({
    proposeSkill: jest.fn(),
    reset: jest.fn(),
    isProposing: false,
    error: null,
  }),
}));

const loaded: SkillCatalog = {
  skills: [skill],
  isLoading: false,
  error: null,
  hasRepositories: true,
  failedRepositories: [],
  truncated: false,
};

function renderPage(path = 'giantswarm/skills/support/ticket-triage') {
  return renderInTestApp(
    <PageHeaderActionsProvider>
      <Routes>
        <Route
          path="/agent-platform/skills/edit/*"
          element={<EditSkillPage />}
        />
      </Routes>
    </PageHeaderActionsProvider>,
    {
      initialRouteEntries: [`/agent-platform/skills/edit/${path}`],
      mountedRoutes: { '/agent-platform/skills': skillsRouteRef },
    },
  );
}

beforeEach(() => {
  mockCatalog = loaded;
  mockContent = { isLoading: false, error: null };
  mockUseSkillContent.mockReset();
  mockMetaAgents = {};
});

describe('EditSkillPage', () => {
  it('reads the skill’s SKILL.md at its pinned commit and opens the form prefilled', async () => {
    mockContent = {
      isLoading: false,
      error: null,
      content: {
        repoUrl: REPO,
        path: skill.path,
        commit: COMMIT,
        name: 'ticket-triage',
        description: 'How to triage.',
        instructions: 'Classify, prioritise, route.',
      },
    };
    await renderPage();

    expect(mockUseSkillContent).toHaveBeenCalledWith(skill);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit skill' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Instructions/)).toHaveValue(
      'Classify, prioritise, route.',
    );
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/agent-platform/skills/giantswarm/skills/support/ticket-triage',
    );
  });

  it('shows the skill creator caveat above the form where the role resolves, and none where it is unconfigured', async () => {
    mockContent = {
      isLoading: false,
      error: null,
      content: {
        repoUrl: REPO,
        path: skill.path,
        commit: COMMIT,
        name: 'ticket-triage',
        description: 'How to triage.',
        instructions: 'Classify, prioritise, route.',
      },
    };
    const { unmount } = await renderPage();
    expect(
      screen.queryByText(
        'This form is for simple skills; for complex, multi-file ones, start a session with Skill Creator, which continues from what you typed.',
      ),
    ).not.toBeInTheDocument();
    unmount();

    mockMetaAgents = { skillCreation: 'kagent/skill-creator' };
    await renderPage();
    expect(
      screen.getByText(
        'This form is for simple skills; for complex, multi-file ones, start a session with Skill Creator, which continues from what you typed.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Edit with Skill Creator' }),
    ).toBeInTheDocument();
  });

  it('waits for the skill while it is being read', async () => {
    mockContent = { isLoading: true, error: null };
    await renderPage();

    // The label shows after the indicator's short hold-back.
    expect(await screen.findByText('Reading the skill…')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Instructions/)).not.toBeInTheDocument();
  });

  it('says why when the SKILL.md could not be read', async () => {
    mockContent = {
      isLoading: false,
      error: new Error('main has moved on; reload the skill.'),
    };
    await renderPage();

    expect(screen.getByText('Could not read the skill')).toBeInTheDocument();
    expect(
      screen.getByText('main has moved on; reload the skill.'),
    ).toBeInTheDocument();
  });

  it('offers no form for a skill outside github.com, whose repository takes no pull request', async () => {
    mockCatalog = {
      ...loaded,
      skills: [{ ...skill, repoUrl: 'http://gitea.lab.local/lab/skills' }],
    };
    await renderPage('-/gitea.lab.local/lab/skills/-/support/ticket-triage');

    expect(mockUseSkillContent).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('Read-only in the portal')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Instructions/)).not.toBeInTheDocument();
    // Cancel goes back to the skill's own (read-only) page.
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
      'href',
      '/agent-platform/skills/-/gitea.lab.local/lab/skills/-/support/ticket-triage',
    );
  });

  it('does not read a skill the portal could not read, and says so instead of a form', async () => {
    mockCatalog = {
      ...loaded,
      skills: [{ ...skill, contentReadable: false }],
    };
    await renderPage();

    expect(mockUseSkillContent).toHaveBeenCalledWith(undefined);
    expect(
      screen.getByText("The portal cannot read this skill's source"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe(
        'Edit ticket-triage · Skills · Agent Platform',
      ),
    );
    expect(screen.queryByLabelText(/Instructions/)).not.toBeInTheDocument();
  });

  it('says when no skill exists at the address', async () => {
    await renderPage('giantswarm/skills/gone');

    expect(mockUseSkillContent).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('Skill not found')).toBeInTheDocument();
    await waitFor(() =>
      expect(document.title).toBe('Edit skill · Skills · Agent Platform'),
    );
  });
});
