import {
  boardItemId,
  findEpic,
  knowledgeDocPath,
  nowSections,
  planPull,
  searchSections,
  whenFromParam,
  windowSections,
} from './frontPage';
import { nowForTeam } from './hive';
import { fixtureHistory, fixtureNow } from './hiveFixtures';

const BUMBLEBEE = 'Bumblebee🐝';

describe('frontPage', () => {
  it('reads the moment from ?when=, now by default', () => {
    expect(whenFromParam('weeks')).toBe('weeks');
    expect(whenFromParam(null)).toBe('now');
    expect(whenFromParam('years')).toBe('now');
  });

  it('reads the links an item carries', () => {
    expect(boardItemId(['https://x', '/hive/board/items/PVTI_a%2Fb'])).toBe(
      'PVTI_a/b',
    );
    expect(boardItemId([undefined, 'https://github.com/o/r/issues/1'])).toBe(
      undefined,
    );
    expect(planPull('https://github.com/o/plans/pull/41')).toEqual({
      repo: 'o/plans',
      number: 41,
    });
    expect(planPull('https://github.com/o/r/issues/41')).toBeUndefined();
    expect(knowledgeDocPath('/hive/knowledge?doc=k%2Fa.md')).toBe('k/a.md');
    expect(knowledgeDocPath('https://x/knowledge?doc=k')).toBeUndefined();
  });

  it('shows the same sections in the same order at every moment', () => {
    const now = nowForTeam(fixtureNow(), BUMBLEBEE);
    const ids = nowSections(now).map(section => section.id);
    expect(ids).toEqual([
      'customers',
      'top-epics',
      'setup',
      'plans',
      'other-teams',
    ]);
    expect(
      windowSections(fixtureHistory('weeks'), now.reviews).map(s => s.id),
    ).toEqual(ids);
  });

  it('puts blocked work at the top of its section and opens epics in place', () => {
    const [customers] = nowSections(nowForTeam(fixtureNow(), BUMBLEBEE));
    expect(customers.blocked.map(item => item.title)).toEqual([
      'Backstage UI for cluster creation',
    ]);
    expect(customers.blocked[0].blocker).toMatch(/^Waits on .* · since /);
    expect(customers.items[0].target).toEqual({
      kind: 'item',
      id: 'fixture-3297',
    });
  });

  it('ranks the plans by need, reviews open in place, merged ones out', () => {
    const now = fixtureNow();
    const plans = nowSections(now).find(section => section.id === 'plans')!;
    expect(plans.items.map(item => item.status?.label)).toEqual([
      'Needs review',
      'Needs review',
      'Draft',
      'Grilling',
      'Grilling',
    ]);
    expect(plans.items[0].target).toEqual({
      kind: 'pr',
      repo: 'example/team-plans',
      number: 41,
    });

    const merged = (window: 'days' | 'weeks' | 'months') =>
      windowSections(fixtureHistory(window), now.reviews)
        .find(section => section.id === 'plans')!
        .items.map(item => item.title);
    expect(merged('days')).toEqual([]);
    expect(merged('weeks')).toEqual([
      'The Bot PRs page in the developer portal',
      'Flux: the tree with its blocking conditions',
    ]);
  });

  it("lists the other teams' work a window touched", () => {
    const other = windowSections(fixtureHistory('days'), []).find(
      section => section.id === 'other-teams',
    )!;
    expect(other.items.map(item => item.status?.label)).toEqual([
      'Atlas',
      'Honey Badger',
    ]);
  });

  it('narrows every section to a search, saying so when one is empty', () => {
    const sections = searchSections(nowSections(fixtureNow()), 'marge');
    const topEpics = sections.find(section => section.id === 'top-epics')!;
    expect(topEpics.items.every(item => /marge/i.test(item.title))).toBe(true);
    const customers = sections.find(section => section.id === 'customers')!;
    expect(customers.items).toEqual([]);
    expect(customers.empty).toBe('Nothing here matches the search.');
  });

  it('finds an epic by its board item in both sources', () => {
    const epic = findEpic(
      'fixture-4360',
      fixtureNow(),
      fixtureHistory('weeks'),
    );
    expect(epic.card?.title).toMatch(/^marge sweep engine/);
    expect(epic.group?.title).toBe('marge sweep engine');
    expect(findEpic('fixture-1', fixtureNow(), undefined)).toEqual({
      card: undefined,
      group: undefined,
    });
  });
});
