import { formatDuration, formatTokens, groupIntoTurns } from './helpers';
import { TimelineItem } from '../../lib/kagentTimeline';

describe('formatDuration', () => {
  const start = '2026-07-23T16:00:00.000Z';

  function at(offsetMs: number): string {
    return new Date(Date.parse(start) + offsetMs).toISOString();
  }

  it.each([
    [0, '0s'],
    [1_500, '2s'],
    [45_000, '45s'],
    [60_000, '1m'],
    [34 * 60_000, '34m'],
    [59 * 60_000 + 59_000, '59m'],
    [60 * 60_000, '1h'],
    [2 * 3_600_000 + 15 * 60_000, '2h 15m'],
    [24 * 3_600_000, '1d'],
    [27 * 3_600_000, '1d 3h'],
  ])('formats a %pms span as %s', (offset, expected) => {
    expect(formatDuration(start, at(offset as number))).toBe(expected);
  });

  it('shows seconds rather than rounding a quick answer to 0m', () => {
    // A one-shot question answered immediately is a real session, and "0m" would
    // read as missing data.
    expect(formatDuration(start, at(4_000))).toBe('4s');
  });

  it.each([
    [undefined, '2026-07-23T16:00:00.000Z'],
    ['2026-07-23T16:00:00.000Z', undefined],
    [undefined, undefined],
    ['nonsense', '2026-07-23T16:00:00.000Z'],
    ['2026-07-23T16:00:00.000Z', 'nonsense'],
  ])('returns undefined for (%p, %p)', (from, to) => {
    expect(formatDuration(from, to)).toBeUndefined();
  });

  it('returns undefined rather than a negative span', () => {
    // Clock skew between whoever wrote the timestamps and us. "-3m" is worse than
    // no answer.
    expect(formatDuration(at(60_000), start)).toBeUndefined();
  });
});

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
