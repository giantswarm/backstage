import {
  findStatusOption,
  groupByAssignee,
  issueRefOf,
  mergeColumnReads,
} from './board';
import { RoadmapItem } from '../apis';

function item(overrides: Partial<RoadmapItem>): RoadmapItem {
  return {
    id: 'PVTI_x',
    title: 'An item',
    repo: 'giantswarm/giantswarm',
    private: true,
    fields: {},
    ...overrides,
  };
}

describe('findStatusOption', () => {
  const options = [
    'Inbox 📥',
    'Backlog 📦',
    'Up Next ➡️',
    'In Progress ⛏️',
    'Validation ☑️',
    'Done ✅',
  ];

  it('matches the board value with emoji by keyword', () => {
    expect(findStatusOption(options, 'in progress')).toBe('In Progress ⛏️');
    expect(findStatusOption(options, 'validation')).toBe('Validation ☑️');
  });

  it('returns undefined for unknown keywords and missing options', () => {
    expect(findStatusOption(options, 'review')).toBeUndefined();
    expect(findStatusOption(undefined, 'in progress')).toBeUndefined();
  });
});

describe('issueRefOf', () => {
  it('splits repo and number', () => {
    expect(issueRefOf({ repo: 'giantswarm/giantswarm', number: 1234 })).toEqual(
      { owner: 'giantswarm', repo: 'giantswarm', number: 1234 },
    );
  });

  it('returns undefined for draft items without an issue', () => {
    expect(issueRefOf({ repo: null, number: 12 })).toBeUndefined();
    expect(
      issueRefOf({ repo: 'giantswarm/giantswarm', number: '' }),
    ).toBeUndefined();
  });
});

describe('groupByAssignee', () => {
  it('groups items per assignee and collects unassigned separately', () => {
    const shared = item({ id: 'a', assignees: ['anna', 'ben'] });
    const solo = item({ id: 'b', assignees: ['ben'] });
    const orphan = item({ id: 'c', assignees: [] });

    const { groups, unassigned } = groupByAssignee([shared, solo, orphan]);

    expect(groups).toEqual([
      { assignee: 'anna', items: [shared] },
      { assignee: 'ben', items: [shared, solo] },
    ]);
    expect(unassigned).toEqual([orphan]);
  });
});

describe('mergeColumnReads', () => {
  it('joins the column reads in column order', () => {
    const a = item({ id: 'a', fields: { Status: 'Backlog' } });
    const b = item({ id: 'b', fields: { Status: 'Done' } });
    expect(
      mergeColumnReads([
        { column: 'Backlog', items: [a] },
        { column: 'Done', items: undefined },
        { column: 'Done', items: [b] },
      ]),
    ).toEqual([a, b]);
  });

  it('keeps one copy of a moved card, the one its column read', () => {
    // Moved from Backlog to Done: the Backlog read still holds the card,
    // patched to its new status, until it refetches.
    const patched = item({
      id: 'a',
      title: 'patched',
      fields: { Status: 'Done' },
    });
    const fresh = item({ id: 'a', title: 'fresh', fields: { Status: 'Done' } });
    expect(
      mergeColumnReads([
        { column: 'Backlog', items: [patched] },
        { column: 'Done', items: [fresh] },
      ]),
    ).toEqual([fresh]);
    expect(
      mergeColumnReads([
        { column: 'Done', items: [fresh] },
        { column: 'Backlog', items: [patched] },
      ]),
    ).toEqual([fresh]);
  });
});
