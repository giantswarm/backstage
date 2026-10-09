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
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({
    rows: [{ id: 'a', skillIds: [`${REPO}#triage`] }] as AgentRow[],
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
