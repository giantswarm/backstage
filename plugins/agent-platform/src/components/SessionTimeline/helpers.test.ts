import {
  groupIntoTurns,
  humanizeToolName,
  segmentTurn,
  summarizeWork,
} from './helpers';
import { TimelineItem } from '../../lib/kagentTimeline';

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

describe('humanizeToolName', () => {
  it('turns identifiers into readable phrases', () => {
    expect(humanizeToolName('github_search_issues')).toBe(
      'Github search issues',
    );
    expect(humanizeToolName('post-message')).toBe('Post message');
    expect(humanizeToolName('listClusters')).toBe('List clusters');
  });

  it('leaves a name with nothing to split as itself', () => {
    expect(humanizeToolName('reconcile')).toBe('Reconcile');
    expect(humanizeToolName('___')).toBe('___');
  });
});

describe('segmentTurn', () => {
  const at = (kind: TimelineItem['kind'], id: string, extra = {}) =>
    ({ kind, id, taskIndex: 0, text: 'x', ...extra }) as TimelineItem;
  const tool = (id: string, toolName = 't') =>
    at('tool-call', id, { toolName, isPending: false });

  it('folds a run of work that holds a call and more than one step', () => {
    const segments = segmentTurn([
      at('user-message', 'u'),
      at('reasoning', 'r'),
      tool('a'),
      at('agent-message', 'm'),
    ]);

    expect(
      segments.map(s => (s.kind === 'work' ? s.items.length : s.kind)),
    ).toEqual(['item', 2, 'item']);
  });

  it('keeps a lone call, and reasoning on its own, inline', () => {
    const segments = segmentTurn([
      tool('a'),
      at('agent-message', 'm'),
      at('reasoning', 'r1'),
      at('reasoning', 'r2'),
    ]);

    expect(segments.every(s => s.kind === 'item')).toBe(true);
  });

  it('splits on what the agent says between runs, keeping order', () => {
    const segments = segmentTurn([
      tool('a'),
      tool('b'),
      at('agent-message', 'm'),
      tool('c'),
      tool('d'),
    ]);

    expect(segments.map(s => (s.kind === 'work' ? s.id : 'item'))).toEqual([
      'a',
      'item',
      'c',
    ]);
  });

  it('never folds an approval', () => {
    const segments = segmentTurn([
      tool('a'),
      at('approval', 'p', { asks: 'approval' }),
      tool('b'),
    ]);

    expect(segments.map(s => s.kind)).toEqual(['item', 'item', 'item']);
  });
});

describe('summarizeWork', () => {
  it('counts tools by name and calls by call, as the prototype does', () => {
    const items = [
      { kind: 'reasoning', id: 'r', taskIndex: 0, text: 'x' },
      {
        kind: 'tool-call',
        id: 'a',
        taskIndex: 0,
        toolName: 'get',
        isPending: false,
      },
      {
        kind: 'tool-call',
        id: 'b',
        taskIndex: 0,
        toolName: 'get',
        isPending: false,
      },
      {
        kind: 'tool-call',
        id: 'c',
        taskIndex: 0,
        toolName: 'post',
        isPending: false,
      },
      {
        kind: 'agent-call',
        id: 'd',
        taskIndex: 0,
        agentId: 'k__NS__sre',
        isPending: false,
      },
    ] as TimelineItem[];

    expect(summarizeWork(items)).toEqual({
      label: 'Used 2 tools · Asked 1 agent',
      technicalLabel: '5 steps · 4 tool calls',
    });
  });

  it('speaks in the singular for one', () => {
    const items = [
      { kind: 'reasoning', id: 'r', taskIndex: 0, text: 'x' },
      {
        kind: 'tool-call',
        id: 'a',
        taskIndex: 0,
        toolName: 'get',
        isPending: false,
      },
    ] as TimelineItem[];

    expect(summarizeWork(items)).toEqual({
      label: 'Used 1 tool',
      technicalLabel: '2 steps · 1 tool call',
    });
  });
});
