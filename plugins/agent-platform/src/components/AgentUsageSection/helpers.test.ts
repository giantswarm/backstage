import { UsageDayEntry } from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentRow } from '../AgentsDataProvider';
import {
  fillMissingDays,
  hasAnyUsage,
  narrowDaily,
  sessionCountForWindow,
  sortUsageRows,
  sumDaily,
  toByAgentRows,
} from './helpers';

function agent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'gazelle/kagent/sre-agent',
    installation: 'gazelle',
    namespace: 'kagent',
    name: 'SRE Agent',
    technicalName: 'sre-agent',
    description: '',
    ...overrides,
  } as AgentRow;
}

const hrefFor = (row: AgentRow) => `/agents/${row.installation}/${row.name}`;

describe('toByAgentRows', () => {
  const entry = {
    agentId: 'kagent__NS__sre_agent',
    sessions: 2,
    turns: 5,
    inputTokens: 100,
    outputTokens: 10,
  };

  it('resolves a matched agent to its display name and a link', () => {
    const [row] = toByAgentRows(
      [entry],
      'gazelle',
      [agent()],
      hrefFor,
      'Unattributed',
    );

    expect(row.agentName).toBe('SRE Agent');
    expect(row.href).toBe('/agents/gazelle/SRE Agent');
  });

  it('keeps an agent that matches no CR, shown decoded', () => {
    // It may have been deleted since, and its spend is still part of the total
    // above the table. Dropping it would make the two disagree.
    const [row] = toByAgentRows(
      [entry],
      'gazelle',
      [],
      hrefFor,
      'Unattributed',
    );

    // `decodeAgentIdLabel` keeps the namespace, which is more use than a bare
    // name when there is no CR to resolve against.
    expect(row.agentName).toBe('kagent/sre-agent');
    expect(row.href).toBeUndefined();
  });

  it('does not match an agent from another installation', () => {
    const [row] = toByAgentRows(
      [entry],
      'gazelle',
      [agent({ installation: 'golem' })],
      hrefFor,
      'Unattributed',
    );

    expect(row.agentName).toBe('kagent/sre-agent');
    expect(row.href).toBeUndefined();
  });

  it('labels a null agent with the caller’s wording', () => {
    // The wire leaves `null` unlabelled on purpose, so a copy change stays a
    // frontend change.
    const [row] = toByAgentRows(
      [{ ...entry, agentId: null }],
      'gazelle',
      [],
      hrefFor,
      'Unattributed',
    );

    expect(row.agentName).toBe('Unattributed');
    expect(row.href).toBeUndefined();
  });
});

describe('fillMissingDays', () => {
  const day = (d: string, inputTokens = 0): UsageDayEntry => ({
    day: d,
    inputTokens,
    outputTokens: 0,
    turns: inputTokens > 0 ? 1 : 0,
  });

  it('fills a gap with zeros and keeps the values it has', () => {
    // A bar chart handed a sparse series silently compresses the timeline —
    // N bars that do not mean N days.
    const filled = fillMissingDays(
      [day('2026-09-01', 100), day('2026-09-04', 400)],
      3,
    );

    expect(filled.map(entry => entry.day)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
    expect(filled.map(entry => entry.inputTokens)).toEqual([100, 0, 0, 400]);
  });

  it('leaves an empty series alone', () => {
    expect(fillMissingDays([], 30)).toEqual([]);
  });

  it('leaves an unparseable first day alone rather than inventing a range', () => {
    const sparse = [day('not-a-date', 5)];
    expect(fillMissingDays(sparse, 3)).toBe(sparse);
  });
});

describe('narrowDaily', () => {
  const NOW = Date.parse('2026-09-04T12:00:00Z');
  const day = (d: string, turns = 1): UsageDayEntry => ({
    day: d,
    inputTokens: 100,
    outputTokens: 10,
    turns,
  });

  it('keeps the last N UTC days, today included', () => {
    const daily = [
      day('2026-08-20'),
      day('2026-08-29'), // the cutoff day itself, 7 days back incl. today
      day('2026-09-04'),
    ];

    expect(narrowDaily(daily, 7, NOW).map(entry => entry.day)).toEqual([
      '2026-08-29',
      '2026-09-04',
    ]);
  });

  it('drops the day just outside the window', () => {
    const daily = [day('2026-08-28'), day('2026-08-29')];

    expect(narrowDaily(daily, 7, NOW).map(entry => entry.day)).toEqual([
      '2026-08-29',
    ]);
  });

  it('returns nothing for a non-positive window', () => {
    expect(narrowDaily([day('2026-09-04')], 0, NOW)).toEqual([]);
  });
});

describe('sumDaily', () => {
  it('totals the figures the daily buckets carry', () => {
    expect(
      sumDaily([
        {
          day: '2026-09-03',
          inputTokens: 100,
          outputTokens: 10,
          turns: 2,
          toolCalls: 4,
          lastActiveSessions: 1,
        },
        {
          day: '2026-09-04',
          inputTokens: 50,
          outputTokens: 5,
          turns: 1,
          toolCalls: 1,
          lastActiveSessions: 2,
        },
      ]),
    ).toEqual({
      turns: 3,
      inputTokens: 150,
      outputTokens: 15,
      sessions: 3,
      toolCalls: 5,
    });
  });

  it('leaves sessions and tool calls unknown when a day does not report them', () => {
    expect(
      sumDaily([
        { day: '2026-09-03', inputTokens: 100, outputTokens: 10, turns: 2 },
        {
          day: '2026-09-04',
          inputTokens: 50,
          outputTokens: 5,
          turns: 1,
          toolCalls: 1,
          lastActiveSessions: 1,
        },
      ]),
    ).toEqual({
      turns: 3,
      inputTokens: 150,
      outputTokens: 15,
      sessions: undefined,
      toolCalls: undefined,
    });
  });

  it('totals an empty window to zeros', () => {
    expect(sumDaily([])).toEqual({
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      sessions: 0,
      toolCalls: 0,
    });
  });
});

describe('sessionCountForWindow', () => {
  const NOW = Date.parse('2026-09-04T12:00:00Z');
  const usage = {
    windowDays: 30,
    totals: { sessions: 15 },
    daily: [
      {
        day: '2026-08-20',
        inputTokens: 0,
        outputTokens: 0,
        turns: 3,
        lastActiveSessions: 11,
      },
      {
        day: '2026-09-01',
        inputTokens: 0,
        outputTokens: 0,
        turns: 2,
        lastActiveSessions: 3,
      },
      {
        day: '2026-09-04',
        inputTokens: 0,
        outputTokens: 0,
        turns: 1,
        lastActiveSessions: 1,
      },
    ],
  } as never;

  it("counts a narrower selection's sessions from the days", () => {
    expect(sessionCountForWindow(usage, 7, NOW)).toEqual({ days: 7, count: 4 });
  });

  it("takes the backend's total, and names its window, for a wider one", () => {
    expect(sessionCountForWindow(usage, 90, NOW)).toEqual({
      days: 30,
      count: 15,
    });
  });
});

describe('fillMissingDays past today', () => {
  it('draws no bar for a day that has not begun', () => {
    // A 7-day cut holds 7 day keys; filling 7 + 1 from its first drew
    // tomorrow (QA round 1).
    const NOW = Date.parse('2026-09-04T12:00:00Z');
    const filled = fillMissingDays(
      [
        { day: '2026-08-29', inputTokens: 0, outputTokens: 0, turns: 0 },
        { day: '2026-09-04', inputTokens: 0, outputTokens: 0, turns: 0 },
      ],
      7,
      NOW,
    );
    expect(filled[filled.length - 1].day).toBe('2026-09-04');
    expect(filled).toHaveLength(7);
  });
});

describe('hasAnyUsage', () => {
  it('is false for no summary and for an empty window', () => {
    expect(hasAnyUsage(undefined)).toBe(false);
    expect(hasAnyUsage({ totals: { sessions: 0 } } as never)).toBe(false);
  });

  it('is true once a session had activity in the window', () => {
    expect(hasAnyUsage({ totals: { sessions: 1 } } as never)).toBe(true);
  });
});

describe('sortUsageRows with a column that can be undefined', () => {
  type Row = { name: string; cost: number | undefined };
  const sortBy = (rows: Row[], direction: 'ascending' | 'descending') =>
    sortUsageRows(rows, { column: 'cost', direction }, 'name').map(
      row => row.name,
    );

  it('keeps the priced rows correctly ordered around an unpriced one', () => {
    // The regression this exists for: returning 0 for the em dash made the
    // comparator intransitive, so `Array#sort` was free to misorder the rows
    // that *do* have values — landing the biggest spender last in a
    // descending-by-cost table.
    const rows: Row[] = [
      { name: 'B', cost: 5 },
      { name: 'A', cost: undefined },
      { name: 'C', cost: 10 },
    ];

    expect(sortBy(rows, 'descending')).toEqual(['C', 'B', 'A']);
    expect(sortBy(rows, 'ascending')).toEqual(['B', 'C', 'A']);
  });

  it('sinks the unknowns to the end in both directions', () => {
    // Not "last when descending, first when ascending": an em dash is absence
    // of a value, not a small one, so it never leads the table.
    const rows: Row[] = [
      { name: 'A', cost: undefined },
      { name: 'B', cost: 1 },
      { name: 'C', cost: undefined },
      { name: 'D', cost: 2 },
    ];

    expect(sortBy(rows, 'ascending')).toEqual(['B', 'D', 'A', 'C']);
    expect(sortBy(rows, 'descending')).toEqual(['D', 'B', 'A', 'C']);
  });

  it('orders unknowns among themselves by label, for a stable render', () => {
    const rows: Row[] = [
      { name: 'Z', cost: undefined },
      { name: 'A', cost: undefined },
    ];

    expect(sortBy(rows, 'descending')).toEqual(['A', 'Z']);
  });

  it('is a total order, so sort cannot depend on the incoming order', () => {
    // Every permutation of the same three rows must sort identically. An
    // intransitive comparator fails this even when one arrangement happens to
    // come out right.
    const rows: Row[] = [
      { name: 'B', cost: 5 },
      { name: 'A', cost: undefined },
      { name: 'C', cost: 10 },
    ];
    const permutations: Row[][] = [
      [rows[0], rows[1], rows[2]],
      [rows[0], rows[2], rows[1]],
      [rows[1], rows[0], rows[2]],
      [rows[1], rows[2], rows[0]],
      [rows[2], rows[0], rows[1]],
      [rows[2], rows[1], rows[0]],
    ];

    for (const permutation of permutations) {
      expect(sortBy(permutation, 'descending')).toEqual(['C', 'B', 'A']);
    }
  });

  it('still sorts an all-number column as before', () => {
    const rows = [
      { name: 'A', turns: 3 },
      { name: 'B', turns: 1 },
      { name: 'C', turns: 2 },
    ];

    expect(
      sortUsageRows(rows, { column: 'turns', direction: 'descending' }, 'name'),
    ).toEqual([rows[0], rows[2], rows[1]]);
  });
});
