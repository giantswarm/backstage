import { screen, within } from '@testing-library/react';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import { skillsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import { CustomizeSkillsPanel } from './CustomizeSkillsPanel';

const REPO = 'https://github.com/giantswarm/skills';

let mockRepositories: string[] = [];
jest.mock('@giantswarm/backstage-plugin-gs-react', () => ({
  useSignedInConfig: () => ({
    config: { getOptionalStringArray: () => mockRepositories },
    isLoading: false,
  }),
}));

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

function renderPanel(search = '') {
  return renderInTestApp(<CustomizeSkillsPanel search={search} />, {
    mountedRoutes: { '/agent-platform/skills': skillsRouteRef },
  });
}

/** The table's data rows, in order (the header row skipped). */
function listedRows(): HTMLElement[] {
  const table = screen.getByRole('grid');
  return within(table)
    .getAllByRole('row')
    .filter(row => within(row).queryAllByRole('columnheader').length === 0);
}

describe('CustomizeSkillsPanel', () => {
  beforeEach(() => {
    mockCatalog = loaded;
    mockAgentSkillIds = [`${REPO}#triage`];
    mockRepositories = [REPO];
  });

  it('lists the most used skills first, with their source and usage', async () => {
    await renderPanel();

    // One flat table — the Connectors tab's presentation — most used first.
    const rows = listedRows();
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('triage')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Used by 1 agent')).toBeInTheDocument();
    expect(within(rows[1]).getByText('summarise')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Not used yet')).toBeInTheDocument();
    expect(screen.getAllByText('giantswarm/skills')).toHaveLength(2);
  });

  it('names a repository it could not read', async () => {
    mockCatalog = { ...loaded, failedRepositories: [`${REPO}-private`] };
    await renderPanel();

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
    await renderPanel();

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
    await renderPanel();

    const rows = listedRows();
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('triage')).toBeInTheDocument();
    expect(within(rows[1]).getByText('notes')).toBeInTheDocument();
    expect(within(rows[2]).getByText('summarise')).toBeInTheDocument();
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
    await renderPanel();

    expect(screen.getByText('Used by 1 agent')).toBeInTheDocument();
    expect(screen.getByText('GiantSwarm/skills')).toBeInTheDocument();
  });

  it('says when no repository is configured', async () => {
    mockCatalog = { ...loaded, skills: [], hasRepositories: false };
    await renderPanel();

    expect(screen.getByText('No skill repositories')).toBeInTheDocument();
  });

  it('says when the search matches nothing', async () => {
    await renderPanel('zzz');

    expect(screen.getByText('No skills match “zzz”.')).toBeInTheDocument();
  });
});

describe('CustomizeSkillsPanel links and Add skill', () => {
  beforeEach(() => {
    mockCatalog = loaded;
    mockAgentSkillIds = [];
    mockRepositories = [REPO];
  });

  it('links each skill row to its detail page', async () => {
    await renderPanel();

    const row = screen.getByText('triage').closest('tr') as HTMLElement;
    expect(row).toHaveAttribute(
      'data-href',
      '/agent-platform/skills/giantswarm/skills/triage',
    );
  });

  it('links Add skill to the add-skill page', async () => {
    await renderPanel();

    expect(screen.getByRole('link', { name: /Add skill/ })).toHaveAttribute(
      'href',
      '/agent-platform/skills/new',
    );
  });

  it('offers no Add skill without a configured repository', async () => {
    mockRepositories = [];
    mockCatalog = { ...loaded, skills: [], hasRepositories: false };
    await renderPanel();

    expect(
      screen.queryByRole('link', { name: /Add skill/ }),
    ).not.toBeInTheDocument();
  });
});
