import { screen } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import type { AgentRow } from '../AgentsDataProvider';
import { CustomizeSkillsPanel } from './CustomizeSkillsPanel';

const REPO = 'https://github.com/giantswarm/skills';

function skill(name: string) {
  return {
    name,
    description: `How to ${name}`,
    repoUrl: REPO,
    path: name,
    ref: 'main',
    commit: 'abc',
  };
}

let mockCatalog: SkillCatalog;
jest.mock('../CustomizeDataProvider', () => ({
  useCustomizeData: () => ({ skillCatalog: mockCatalog }),
}));
let mockAgentSkillIds: string[] = [];
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({
    rows: [{ id: 'a', skillIds: mockAgentSkillIds }] as AgentRow[],
    isLoading: false,
  }),
}));

const loaded: SkillCatalog = {
  skills: [skill('summarise'), skill('triage')],
  isLoading: false,
  error: null,
  hasRepositories: true,
  failedRepositories: [],
  truncated: false,
};

describe('CustomizeSkillsPanel', () => {
  beforeEach(() => {
    mockCatalog = loaded;
    mockAgentSkillIds = [`${REPO}#triage`];
  });

  it('lists the most used skills first, with their source and usage', async () => {
    await renderInTestApp(<CustomizeSkillsPanel search="" />);

    expect(
      screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent),
    ).toEqual(['triage', 'summarise']);
    expect(screen.getByText('Used by 1 agent')).toBeInTheDocument();
    expect(screen.getByText('Not used yet')).toBeInTheDocument();
    expect(screen.getAllByText('giantswarm/skills')).toHaveLength(2);
  });

  it('names a repository it could not read', async () => {
    mockCatalog = { ...loaded, failedRepositories: [`${REPO}-private`] };
    await renderInTestApp(<CustomizeSkillsPanel search="" />);

    expect(
      screen.getByText('Could not read giantswarm/skills-private'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'The skills of giantswarm/skills-private are missing below.',
      ),
    ).toBeInTheDocument();
  });

  it('says once, with the reason, when no repository could be read', async () => {
    mockCatalog = {
      ...loaded,
      skills: [],
      failedRepositories: [REPO],
      failureMessages: {
        [REPO]:
          'Failed to discover skills: GitHub refused the read because the API rate limit of this portal is used up.',
      },
    };
    await renderInTestApp(<CustomizeSkillsPanel search="" />);

    expect(
      screen.getByText('Could not read giantswarm/skills'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Failed to discover skills: GitHub refused the read because the API rate limit of this portal is used up. No skill could be listed.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('No skills yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/missing below/)).not.toBeInTheDocument();
  });

  it('counts each skill once, however its repository is written', async () => {
    mockCatalog = {
      ...loaded,
      skills: [
        skill('triage'),
        { ...skill('triage'), repoUrl: `${REPO}.git/` },
        skill('summarise'),
        {
          ...skill('notes'),
          repoUrl: 'https://github.com/giantswarm/other-skills',
        },
      ],
    };
    await renderInTestApp(<CustomizeSkillsPanel search="" />);

    expect(
      screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent),
    ).toEqual(['triage', 'notes', 'summarise']);
    expect(
      screen.getByText('The skills your agents use most come first.', {
        exact: false,
      }),
    ).toHaveTextContent(
      'The skills your agents use most come first. 3 skills from 2 sources in total.',
    );
  });

  it('matches an agent that writes the repository another way', async () => {
    mockAgentSkillIds = ['https://github.com/giantswarm/skills#summarise'];
    mockCatalog = {
      ...loaded,
      skills: [
        {
          ...skill('summarise'),
          repoUrl: 'git@github.com:GiantSwarm/skills.git',
        },
      ],
    };
    await renderInTestApp(<CustomizeSkillsPanel search="" />);

    expect(screen.getByText('Used by 1 agent')).toBeInTheDocument();
    expect(screen.getByText('GiantSwarm/skills')).toBeInTheDocument();
  });

  it('says when no repository is configured', async () => {
    mockCatalog = { ...loaded, skills: [], hasRepositories: false };
    await renderInTestApp(<CustomizeSkillsPanel search="" />);

    expect(screen.getByText('No skill repositories')).toBeInTheDocument();
  });

  it('says when the search matches nothing', async () => {
    await renderInTestApp(<CustomizeSkillsPanel search="zzz" />);

    expect(screen.getByText('No skills match “zzz”.')).toBeInTheDocument();
  });
});
