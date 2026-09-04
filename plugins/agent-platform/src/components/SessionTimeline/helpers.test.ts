import { formatTokens, groupIntoTurns } from './helpers';
import { TimelineItem } from '../../lib/kagentTimeline';

describe('formatTokens', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1_000, '1.0k'],
    [2_600, '2.6k'],
    [1_400_000, '1.4M'],
  ])('formats %p as %s', (value, expected) => {
    expect(formatTokens(value as number)).toBe(expected);
  });
});

describe('groupIntoTurns', () => {
  function item(taskIndex: number, at?: string): TimelineItem {
    return {
      kind: 'user-message',
      id: `i${taskIndex}`,
      taskIndex,
      at,
      text: 'x',
    } as TimelineItem;
  }

  it('groups consecutive items of the same task', () => {
    const turns = groupIntoTurns([item(0), item(0), item(1)]);

    expect(turns.map(t => t.items.length)).toEqual([2, 1]);
    expect(turns.map(t => t.taskIndex)).toEqual([0, 1]);
  });

  it('takes the turn’s timestamp from its first item', () => {
    const turns = groupIntoTurns([
      item(0, '2026-07-23T16:05:00.000Z'),
      item(0, '2026-07-23T16:05:00.000Z'),
    ]);

    expect(turns[0].at).toBe('2026-07-23T16:05:00.000Z');
  });

  it('starts a new group when a task index reappears non-contiguously', () => {
    // Grouping on runs rather than a keyed map, so items can never be reordered
    // relative to what buildTimeline produced.
    const turns = groupIntoTurns([item(0), item(1), item(0)]);

    expect(turns.map(t => t.taskIndex)).toEqual([0, 1, 0]);
  });

  it('returns nothing for an empty timeline', () => {
    expect(groupIntoTurns([])).toEqual([]);
  });
});
