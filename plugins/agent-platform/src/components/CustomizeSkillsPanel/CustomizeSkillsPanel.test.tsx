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
let mockAgentsLoading = false;
jest.mock('../AgentsDataProvider', () => ({
  useAgents: () => ({
    rows: [{ id: 'a', skillIds: mockAgentSkillIds }] as AgentRow[],
    isLoading: mockAgentsLoading,
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
    mockAgentsLoading = false;
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
    expect(
      within(screen.getByRole('list', { name: 'Skills' })).getAllByText(
        'giantswarm/skills',
      ),
    ).toHaveLength(2);
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

    const card = within(screen.getByRole('list', { name: 'Skills' }));
    expect(card.getByText('Used by 1 agent')).toBeInTheDocument();
    expect(card.getByText('GiantSwarm/skills')).toBeInTheDocument();
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

  it('links a skill outside github.com to its read-only detail page', async () => {
    mockCatalog = {
      ...loaded,
      skills: [
        { ...skill('local'), repoUrl: 'https://git.example.com/team/skills' },
      ],
    };
    await renderPanel();

    expect(screen.getByRole('link', { name: 'local' })).toHaveAttribute(
      'href',
      '/agent-platform/skills/-/git.example.com/team/skills/-/local',
    );
  });

  it('keeps a skill whose repository is not http(s) as a plain card', async () => {
    mockCatalog = {
      ...loaded,
      skills: [{ ...skill('local'), repoUrl: 'file:///srv/skills' }],
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

  it('offers no Add skill when no configured repository is on github.com, and says why', async () => {
    mockRepositories = ['http://gitea.lab.local/lab/skills'];
    await renderPanel();

    expect(
      screen.queryByRole('link', { name: /Add skill/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Skills are added from here as GitHub pull requests/),
    ).toBeInTheDocument();
  });

  it('offers Add skill when one configured repository is on github.com', async () => {
    mockRepositories = ['http://gitea.lab.local/lab/skills', REPO];
    await renderPanel();

    expect(screen.getByRole('link', { name: /Add skill/ })).toBeInTheDocument();
    expect(
      screen.queryByText(/Skills are added from here as GitHub pull requests/),
    ).not.toBeInTheDocument();
  });
});

const OTHER = 'https://github.com/acme/agent-skills';

/** A filter's dropdown; `hidden` keeps it readable while its list is open. */
const filterDropdown = (field: string) =>
  screen.getByRole('button', {
    name: new RegExp(`Filter by ${field}`),
    hidden: true,
  });

/** A filter dropdown's options, as "label count", read and closed again. */
async function filterOptions(field: string) {
  await userEvent.click(filterDropdown(field));
  const options = within(await screen.findByRole('listbox'))
    .getAllByRole('option')
    .map(option => option.textContent);
  await userEvent.keyboard('{Escape}');
  return options;
}

/** Toggles one option of a filter dropdown. */
async function pickFilter(field: string, option: string) {
  await userEvent.click(filterDropdown(field));
  await userEvent.click(await screen.findByRole('option', { name: option }));
  await userEvent.keyboard('{Escape}');
}

const cardNames = () =>
  listedRows().map(row => within(row).getByRole('heading').textContent);

describe('CustomizeSkillsPanel filters (T49, T64)', () => {
  beforeEach(() => {
    mockAgentsLoading = false;
    mockRepositories = [REPO];
  });

  it('offers Source and Usage over three skills of one repository nobody uses', async () => {
    mockCatalog = {
      ...loaded,
      skills: [skill('a'), skill('b'), skill('c')],
    };
    mockAgentSkillIds = [];
    await renderPanel();

    expect(listedRows()).toHaveLength(3);
    // Always there, if only with one option each (T64).
    expect(filterDropdown('source')).toHaveTextContent('SourceAll');
    expect(await filterOptions('source')).toEqual(['giantswarm/skills 3']);
    expect(await filterOptions('usage')).toEqual(['Not used 3']);
    // Add skill keeps its place.
    expect(screen.getByRole('link', { name: /Add skill/ })).toBeInTheDocument();
  });

  it('filters three skills by source and by usage, several sources at once', async () => {
    mockCatalog = {
      ...loaded,
      skills: [
        skill('summarise'),
        skill('triage'),
        { ...skill('notes'), repoUrl: OTHER },
      ],
    };
    mockAgentSkillIds = [`${REPO}#triage`];
    await renderPanel();

    expect(await filterOptions('source')).toEqual([
      'giantswarm/skills 2',
      'acme/agent-skills 1',
    ]);
    expect(await filterOptions('usage')).toEqual([
      'Used by agents 1',
      'Not used 2',
    ]);

    await pickFilter('source', 'giantswarm/skills 2');
    expect(cardNames()).toEqual(['triage', 'summarise']);
    expect(filterDropdown('source')).toHaveTextContent(
      'Sourcegiantswarm/skills',
    );
    // Usage counts follow the source pick.
    expect(await filterOptions('usage')).toEqual([
      'Used by agents 1',
      'Not used 1',
    ]);

    await pickFilter('usage', 'Not used 1');
    expect(cardNames()).toEqual(['summarise']);

    // A second source widens the list again.
    await pickFilter('source', 'acme/agent-skills 1');
    expect(cardNames().sort()).toEqual(['notes', 'summarise']);
    expect(filterDropdown('source')).toHaveTextContent('Source 2');
  });

  it('offers no usage filter while the agents are still read', async () => {
    mockAgentsLoading = true;
    mockCatalog = {
      ...loaded,
      skills: [skill('summarise'), { ...skill('notes'), repoUrl: OTHER }],
    };
    await renderPanel();

    expect(filterDropdown('source')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Filter by usage/ }),
    ).not.toBeInTheDocument();
  });

  it('says when the filters leave nothing, and clears them', async () => {
    mockCatalog = {
      ...loaded,
      skills: [skill('summarise'), { ...skill('notes'), repoUrl: OTHER }],
    };
    mockAgentSkillIds = [];
    // "summarise" is searched; the other source has no match.
    await renderPanel('summarise');

    await pickFilter('source', 'acme/agent-skills 0');
    expect(
      screen.getByText('No skills match “summarise” with these filters.'),
    ).toBeInTheDocument();

    // The empty state's way back (the bar offers the same).
    const [, emptyStateClear] = screen.getAllByRole('button', {
      name: 'Clear filters',
    });
    await userEvent.click(emptyStateClear);
    expect(cardNames()).toEqual(['summarise']);
    expect(
      screen.queryByRole('button', { name: 'Clear filters' }),
    ).not.toBeInTheDocument();
  });

  it('filters 300 skills from three repositories, paging the result from its first page', async () => {
    mockCatalog = {
      ...loaded,
      skills: Array.from({ length: 300 }, (_, index) => ({
        ...skill(`skill-${String(index).padStart(3, '0')}`),
        repoUrl: `https://github.com/org/repo-${index % 3}`,
      })),
    };
    mockAgentSkillIds = Array.from(
      { length: 30 },
      (_, index) =>
        `https://github.com/org/repo-${(index * 10) % 3}#skill-${String(
          index * 10,
        ).padStart(3, '0')}`,
    );
    await renderPanel();

    expect(await filterOptions('source')).toEqual([
      'org/repo-0 100',
      'org/repo-1 100',
      'org/repo-2 100',
    ]);
    expect(await filterOptions('usage')).toEqual([
      'Used by agents 30',
      'Not used 270',
    ]);
    await userEvent.click(
      screen.getByRole('button', {
        name: `Show ${SKILL_CARDS_SHOWN} more skills`,
      }),
    );
    expect(listedRows()).toHaveLength(2 * SKILL_CARDS_SHOWN);

    await pickFilter('source', 'org/repo-1 100');

    // A new filter starts from the first page.
    expect(listedRows()).toHaveLength(SKILL_CARDS_SHOWN);
    expect(
      screen.getByText(`${SKILL_CARDS_SHOWN} skills shown, 76 more`),
    ).toBeInTheDocument();
    expect(await filterOptions('usage')).toEqual([
      'Used by agents 10',
      'Not used 90',
    ]);

    // Two sources: any of them.
    await pickFilter('source', 'org/repo-2 100');
    expect(
      screen.getByText(
        `${SKILL_CARDS_SHOWN} skills shown, ${200 - SKILL_CARDS_SHOWN} more`,
      ),
    ).toBeInTheDocument();
    expect(await filterOptions('usage')).toEqual([
      'Used by agents 20',
      'Not used 180',
    ]);

    await userEvent.click(
      within(screen.getByRole('group', { name: 'Filters' })).getByRole(
        'button',
        { name: 'Clear filters' },
      ),
    );
    expect(filterDropdown('source')).toHaveTextContent('SourceAll');
    expect(
      screen.getByText(
        `${SKILL_CARDS_SHOWN} skills shown, ${300 - SKILL_CARDS_SHOWN} more`,
      ),
    ).toBeInTheDocument();
  });
});
