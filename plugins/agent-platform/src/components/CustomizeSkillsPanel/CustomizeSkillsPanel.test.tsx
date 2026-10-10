import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInTestApp } from '@backstage/frontend-test-utils';
import type { SkillCatalog } from '../../hooks/useSkillCatalog';
import { skillsRouteRef } from '../../routes';
import type { AgentRow } from '../AgentsDataProvider';
import {
  CustomizeSkillsPanel,
  SKILL_CARDS_SHOWN,
} from './CustomizeSkillsPanel';

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

/** The catalog's cards, in order. */
function listedRows(): HTMLElement[] {
  // The prototype's presentation: a grid of cards, no table.
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  return within(screen.getByRole('list', { name: 'Skills' })).getAllByRole(
    'listitem',
  );
}

describe('CustomizeSkillsPanel', () => {
  beforeEach(() => {
    mockCatalog = loaded;
    mockAgentSkillIds = [`${REPO}#triage`];
    mockRepositories = [REPO];
  });

  it('lists the most used skills first, with their source and usage', async () => {
    await renderPanel();

    // A card per skill, as the prototype draws the tab, most used first.
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

describe('CustomizeSkillsPanel at 3 skills and at 300 (T39)', () => {
  const catalogOf = (count: number): SkillCatalog => ({
    ...loaded,
    skills: Array.from({ length: count }, (_, index) =>
      skill(`skill-${String(index).padStart(3, '0')}`),
    ),
  });

  beforeEach(() => {
    mockAgentSkillIds = [];
    mockRepositories = [REPO];
  });

  it('shows a short catalog whole, with no paging and no ranking note', async () => {
    mockCatalog = catalogOf(3);
    await renderPanel();

    expect(listedRows()).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: /Show .* more/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/shown/)).not.toBeInTheDocument();
    expect(screen.queryByText(/use most come first/)).not.toBeInTheDocument();
  });

  it('pages a long catalog, with the ranking note over it', async () => {
    mockCatalog = catalogOf(300);
    await renderPanel();

    expect(listedRows()).toHaveLength(SKILL_CARDS_SHOWN);
    expect(
      screen.getByText(`${SKILL_CARDS_SHOWN} skills shown, 276 more`),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The skills your agents use most come first.', {
        exact: false,
      }),
    ).toHaveTextContent(
      'The skills your agents use most come first. 300 skills from 1 source in total.',
    );

    await userEvent.click(
      screen.getByRole('button', {
        name: `Show ${SKILL_CARDS_SHOWN} more skills`,
      }),
    );

    expect(listedRows()).toHaveLength(2 * SKILL_CARDS_SHOWN);
  });

  it('pages the matches of a search from the first page', async () => {
    mockCatalog = catalogOf(300);
    // "skill-1" matches skill-100 to skill-199: 100 cards.
    await renderPanel('skill-1');

    expect(listedRows()).toHaveLength(SKILL_CARDS_SHOWN);
    expect(
      screen.getByText(`${SKILL_CARDS_SHOWN} skills shown, 76 more`),
    ).toBeInTheDocument();
  });
});

describe('CustomizeSkillsPanel links and Add skill', () => {
  beforeEach(() => {
    mockCatalog = loaded;
    mockAgentSkillIds = [];
    mockRepositories = [REPO];
  });

  it('links each skill card to its detail page', async () => {
    await renderPanel();

    expect(screen.getByRole('link', { name: 'triage' })).toHaveAttribute(
      'href',
      '/agent-platform/skills/giantswarm/skills/triage',
    );
  });

  it('keeps a skill without a detail page as a plain card', async () => {
    mockCatalog = {
      ...loaded,
      skills: [
        { ...skill('local'), repoUrl: 'https://git.example.com/team/skills' },
      ],
    };
    await renderPanel();

    const [card] = listedRows();
    expect(within(card).getByText('local')).toBeInTheDocument();
    expect(within(card).queryByRole('link')).not.toBeInTheDocument();
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
