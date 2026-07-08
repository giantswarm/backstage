import { BoardItem } from '../apis';
import { groupByAssignee, groupByField, parseRepoSlug } from './board';

function item(overrides: Partial<BoardItem>): BoardItem {
  return {
    id: 'item',
    title: 'Item',
    repo: null,
    private: null,
    fields: {},
    ...overrides,
  };
}

describe('groupByField', () => {
  it('groups in schema option order and collects unset values', () => {
    const items = [
      item({ id: 'a', fields: { Status: 'Done ✅' } }),
      item({ id: 'b', fields: { Status: 'Inbox 📥' } }),
      item({ id: 'c', fields: {} }),
      item({ id: 'd', fields: { Status: 'Inbox 📥' } }),
    ];

    const groups = groupByField(items, ['Inbox 📥', 'Done ✅'], 'Status');

    expect(groups.map(group => group.value)).toEqual([
      'Inbox 📥',
      'Done ✅',
      'No status',
    ]);
    expect(groups[0].items.map(i => i.id)).toEqual(['b', 'd']);
    expect(groups[1].items.map(i => i.id)).toEqual(['a']);
    expect(groups[2].items.map(i => i.id)).toEqual(['c']);
  });
});

describe('groupByAssignee', () => {
  it('lists unassigned first and duplicates multi-assignee items', () => {
    const items = [
      item({ id: 'a', assignees: ['zeta', 'alpha'] }),
      item({ id: 'b' }),
    ];

    const groups = groupByAssignee(items);

    expect(groups.map(group => group.assignee)).toEqual(['', 'alpha', 'zeta']);
    expect(groups[1].items[0].id).toBe('a');
    expect(groups[2].items[0].id).toBe('a');
  });
});

describe('parseRepoSlug', () => {
  it('parses owner and repo', () => {
    expect(parseRepoSlug('giantswarm/giantswarm')).toEqual({
      owner: 'giantswarm',
      repo: 'giantswarm',
    });
    expect(parseRepoSlug(null)).toBeUndefined();
    expect(parseRepoSlug('nope')).toBeUndefined();
  });
});
