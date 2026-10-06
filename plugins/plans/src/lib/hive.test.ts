import { magazineTarget, plansTarget } from '../components/HiveRedirect';
import {
  ALL_TEAMS,
  matchesSearch,
  nowFigures,
  nowForTeam,
  statusIntent,
  statusText,
  teamName,
} from './hive';
import { fixtureNow } from './hiveFixtures';
import { HIVE_TAB_ORDER, orderHiveTabs } from './hiveTabs';

describe('hive', () => {
  it('scopes Now to a team, keeping only other teams as upcoming', () => {
    const now = fixtureNow();
    const bumblebee = nowForTeam(now, 'Bumblebee🐝');
    expect(bumblebee.upcoming.length).toBeGreaterThan(0);
    expect(bumblebee.upcoming.every(card => card.team !== 'Bumblebee🐝')).toBe(
      true,
    );
    expect(nowForTeam(now, ALL_TEAMS).upcoming).toEqual([]);
    expect(
      nowForTeam(now, 'Atlas 🗺️').lanes.every(lane => lane.total === 0),
    ).toBe(true);
  });

  it('derives the figures from the lanes', () => {
    const figures = nowFigures(nowForTeam(fixtureNow(), 'Bumblebee🐝'));
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

  it('sends an old magazine link to its moment or to Knowledge', () => {
    const old = (search: string) => ({ splat: '', search, hash: '' });
    expect(magazineTarget(old('?tab=history&window=weeks'))).toBe(
      '?when=weeks',
    );
    expect(magazineTarget(old(''))).toBe('?when=now');
    expect(magazineTarget(old('?tab=knowledge&doc=a%2Fb.md'))).toBe(
      'knowledge?doc=a%2Fb.md',
    );
  });

  it('sends an old plans link to the Plans section or the review', () => {
    expect(plansTarget({ splat: '', search: '?repo=o%2Fr', hash: '' })).toBe(
      '?when=now#plans',
    );
    expect(
      plansTarget({ splat: 'pr/40', search: '?repo=o%2Fr', hash: '' }),
    ).toBe('?repo=o%2Fr&pr=40');
  });

  it('orders the tabs, unknown ones last', () => {
    const ids = ['x', ...[...HIVE_TAB_ORDER].reverse()];
    expect(orderHiveTabs(ids, id => id)).toEqual([...HIVE_TAB_ORDER, 'x']);
  });
});
