import { magazineTarget } from '../components/HiveRedirect';
import {
  ALL_TEAMS,
  historyForTeam,
  matchesSearch,
  nowFigures,
  nowForTeam,
  plansRepositoriesForTeam,
  sameTeam,
  statusIntent,
  statusText,
  teamName,
} from './hive';
import { fixtureHistory, fixtureMeta, fixtureNow } from './hiveFixtures';

const MAGAZINE_TEAM = fixtureMeta().sources.team;
import { HIVE_TAB_ORDER, orderHiveTabs } from './hiveTabs';

describe('hive', () => {
  it('compares team names without their emoji', () => {
    expect(sameTeam('Phoenix 🔥', 'Phoenix')).toBe(true);
    expect(sameTeam('Bumblebee🐝', 'bumblebee')).toBe(true);
    expect(sameTeam('Atlas 🗺️', 'Phoenix')).toBe(false);
  });

  it('scopes Now to a team, keeping only other teams as upcoming', () => {
    const now = fixtureNow();
    const bumblebee = nowForTeam(now, 'Bumblebee🐝', MAGAZINE_TEAM);
    expect(bumblebee.lanes).toEqual(now.lanes);
    expect(bumblebee.reviews).toEqual(now.reviews);
    expect(bumblebee.upcoming).toEqual(now.upcoming);
    expect(nowForTeam(now, ALL_TEAMS, MAGAZINE_TEAM).upcoming).toEqual([]);

    // Another team: none of the magazine team's cards, plans or summary.
    const phoenix = nowForTeam(now, 'Phoenix 🔥', MAGAZINE_TEAM);
    expect(phoenix.lanes.every(lane => lane.total === 0)).toBe(true);
    expect(phoenix.blocked).toEqual([]);
    expect(phoenix.reviews).toEqual([]);
    expect(phoenix.summary).toEqual([]);
    expect(phoenix.upcoming.map(card => card.team)).not.toContain('Phoenix');
    expect(phoenix.upcoming).toHaveLength(now.upcoming.length - 1);
  });

  it('places a lane card of another team in that team only', () => {
    const now = fixtureNow();
    const [lane, ...rest] = now.lanes;
    const phoenixCard = { ...lane.cards[0], team: 'Phoenix' };
    const mixed = {
      ...now,
      lanes: [
        { ...lane, cards: [phoenixCard, ...lane.cards.slice(1)] },
        ...rest,
      ],
    };
    const phoenix = nowForTeam(mixed, 'Phoenix 🔥', MAGAZINE_TEAM);
    expect(phoenix.lanes[0].cards).toEqual([phoenixCard]);
    expect(phoenix.lanes[0].total).toBe(1);
    const bumblebee = nowForTeam(mixed, 'Bumblebee🐝', MAGAZINE_TEAM);
    expect(bumblebee.lanes[0].cards).not.toContain(phoenixCard);
  });

  it('scopes History to a team, entry by entry', () => {
    const history = fixtureHistory();
    const atlas = historyForTeam(history, 'Atlas 🗺️', MAGAZINE_TEAM);
    expect(atlas.groups.map(group => group.title)).toEqual([
      'GitOps/Flux visibility in Backstage',
    ]);
    expect(atlas.groups[0].entries.map(entry => entry.team)).toEqual(['Atlas']);
    expect(atlas.summary).toEqual([]);
    expect(atlas.chores.count).toBe(0);

    const bumblebee = historyForTeam(history, 'Bumblebee🐝', MAGAZINE_TEAM);
    expect(bumblebee.groups).toHaveLength(history.groups.length);
    expect(
      bumblebee.groups.flatMap(group => group.entries).some(e => e.team),
    ).toBe(false);
    expect(bumblebee.summary).toEqual(history.summary);

    expect(historyForTeam(history, ALL_TEAMS, MAGAZINE_TEAM)).toBe(history);
    expect(historyForTeam(history, 'Shield 🛡️', MAGAZINE_TEAM).groups).toEqual(
      [],
    );
  });

  it('maps a team to its plans repository, all teams to every one', () => {
    const repositories = [
      'giantswarm/bumblebee-plans',
      'giantswarm/honeybadger-plans',
      'giantswarm/atlas-plans',
    ];
    expect(plansRepositoriesForTeam(repositories, 'Bumblebee🐝')).toEqual([
      'giantswarm/bumblebee-plans',
    ]);
    expect(plansRepositoriesForTeam(repositories, 'Honey Badger 🦡')).toEqual([
      'giantswarm/honeybadger-plans',
    ]);
    expect(plansRepositoriesForTeam(repositories, 'Phoenix 🔥')).toEqual([]);
    expect(plansRepositoriesForTeam(repositories, ALL_TEAMS)).toEqual(
      repositories,
    );
  });

  it('derives the figures from the lanes', () => {
    const figures = nowFigures(
      nowForTeam(fixtureNow(), 'Bumblebee🐝', MAGAZINE_TEAM),
    );
    expect(figures.customers).toBe(6);
    expect(figures.blocked).toBe(1);
    expect(figures.plansWaiting).toBe(5);
  });

  it('reads board statuses without their emoji', () => {
    expect(statusText('In Progress ⛏️')).toBe('In Progress');
    expect(teamName('Honey Badger 🦡')).toBe('Honey Badger');
    expect(statusIntent('In Progress ⛏️')).toBe('info');
    expect(statusIntent('Validation ☑️')).toBe('positive');
    expect(statusIntent('Up Next ➡️')).toBe('neutral');
    expect(statusIntent('In Progress ⛏️', true)).toBe('warning');
  });

  it('matches a search case-insensitively, an empty one everything', () => {
    expect(matchesSearch('MARGE', ['marge sweep engine'])).toBe(true);
    expect(matchesSearch('flux', ['marge', undefined])).toBe(false);
    expect(matchesSearch(' ', ['anything'])).toBe(true);
  });

  it('sends an old magazine link to its Hive tab with its parameters', () => {
    expect(magazineTarget('?tab=knowledge&doc=a.md')).toBe(
      'knowledge?doc=a.md',
    );
    expect(magazineTarget('?tab=history&window=months')).toBe('history');
    expect(magazineTarget('')).toBe('now');
  });

  it('orders the tabs, unknown ones last', () => {
    const ids = ['x', ...[...HIVE_TAB_ORDER].reverse()];
    expect(orderHiveTabs(ids, id => id)).toEqual([...HIVE_TAB_ORDER, 'x']);
  });
});
