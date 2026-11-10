import type { MimirMetricSample } from '@giantswarm/backstage-plugin-gs';
import { buildLlmUsage, reduceByPerson } from './llmUsage';

function sample(
  metric: Record<string, string>,
  value: string,
): MimirMetricSample {
  return { metric, value: [1757462400, value] };
}

const options = { unknownLabel: 'No person recorded' };

describe('reduceByPerson', () => {
  it('rolls the calls up by the person the gateway named, and pools the rest', () => {
    const rows = reduceByPerson({
      ...options,
      cost: [
        sample({ user: 'alice@lab.local', gen_ai_token_type: 'input' }, '3'),
        sample({ user: 'alice@lab.local', gen_ai_token_type: 'output' }, '1'),
        sample({ user: 'bob@lab.local' }, '2'),
        // The gateway's own `unknown`, a missing label and an empty one are
        // all nobody.
        sample({ user: 'unknown' }, '0.5'),
        sample({}, '1'),
        sample({ user: '' }, '0.5'),
      ],
      tokens: [
        sample({ user: 'alice@lab.local' }, '4000'),
        sample({ user: 'bob@lab.local' }, '2000'),
        sample({ user: 'unknown' }, '1000'),
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'alice@lab.local',
        user: 'alice@lab.local',
        kind: 'person',
        label: 'alice@lab.local',
        tokens: 4000,
        costUsd: 4,
        sharePct: 50,
      }),
      expect.objectContaining({
        id: 'bob@lab.local',
        kind: 'person',
        tokens: 2000,
        costUsd: 2,
        sharePct: 25,
      }),
      expect.objectContaining({
        id: 'no-person',
        user: '',
        kind: 'unknown',
        label: 'No person recorded',
        tokens: 1000,
        costUsd: 2,
        sharePct: 25,
      }),
    ]);
  });

  it("counts each person's cached input once", () => {
    // Since agentgateway v1.5.0 `input` holds the cache reads and writes.
    const typed = (user: string, values: Record<string, string>) =>
      Object.entries(values).map(([type, value]) =>
        sample({ user, gen_ai_token_type: type }, value),
      );
    const rows = reduceByPerson({
      ...options,
      cost: [],
      tokens: [
        ...typed('alice@lab.local', {
          input: '1000',
          input_cache_read: '800',
          input_cache_write: '150',
          output: '20',
        }),
        ...typed('bob@lab.local', {
          input: '100',
          input_cache_read: '800',
          output: '20',
        }),
      ],
    });

    expect(rows.map(row => [row.label, row.tokens])).toEqual([
      ['alice@lab.local', 1020],
      ['bob@lab.local', 920],
    ]);
  });

  it('ranks by spend, then tokens, then label', () => {
    const rows = reduceByPerson({
      ...options,
      cost: [sample({ user: 'b@x' }, '1'), sample({ user: 'a@x' }, '1')],
      tokens: [sample({ user: 'a@x' }, '10'), sample({ user: 'b@x' }, '10')],
    });

    expect(rows.map(row => row.label)).toEqual(['a@x', 'b@x']);
  });

  it('gives no spend and no share where nothing was priced', () => {
    const rows = reduceByPerson({
      ...options,
      cost: [],
      tokens: [sample({ user: 'a@x' }, '10')],
    });

    expect(rows[0].costUsd).toBeUndefined();
    expect(rows[0].sharePct).toBeUndefined();
  });

  it('is empty without data', () => {
    expect(reduceByPerson({ ...options, cost: [], tokens: [] })).toEqual([]);
  });
});

describe('buildLlmUsage', () => {
  const base = {
    agents: [],
    installation: 'gazelle',
    hrefFor: () => undefined,
    unknownAgentLabel: 'Unattributed',
    unknownModelLabel: 'Unknown model',
    cost: [sample({ agent_namespace: 'kagent', agent: 'a' }, '3')],
    tokens: [sample({ agent_namespace: 'kagent', agent: 'a' }, '3000')],
    calls: [],
    requestsByStatus: [],
    p50: [],
    p95: [],
    outputTokensPerSecond: [],
    unpricedLookups: [],
    costPerDay: [],
    tokensPerDay: [],
    days: ['2026-10-30', '2026-10-31'],
    costToday: [],
    tokensToday: [],
  };

  it('carries the by-person rows and the window when asked for them', () => {
    const usage = buildLlmUsage({
      ...base,
      window: { kind: 'month', month: '2026-10' },
      costByPerson: [sample({ user: 'alice@lab.local' }, '3')],
      tokensByPerson: [sample({ user: 'alice@lab.local' }, '3000')],
    });

    expect(usage.window).toEqual({ kind: 'month', month: '2026-10' });
    expect(usage.byPerson?.map(row => [row.label, row.costUsd])).toEqual([
      ['alice@lab.local', 3],
    ]);
    // The same money, counted by person and by agent.
    expect(usage.byPerson?.[0].costUsd).toBe(usage.totals.costUsd);
  });

  it('carries neither when the view did not ask', () => {
    const usage = buildLlmUsage({ ...base, today: '2026-10-31' });

    expect(usage).not.toHaveProperty('byPerson');
    expect(usage).not.toHaveProperty('window');
  });

  it('names the partial day, and keeps a stale today vector out of a window that has ended', () => {
    const todayVector = [
      sample(
        { gen_ai_response_model: 'model-today', gen_ai_token_type: 'input' },
        '5',
      ),
    ];
    const open = buildLlmUsage({
      ...base,
      today: '2026-10-31',
      costToday: todayVector,
    });
    expect(open.partialDay).toBe('2026-10-31');
    expect(open.costPerDay.series).toContain('model-today');

    // A past month: its today queries are off, but react-query may still
    // hold the days window's answer for them.
    const ended = buildLlmUsage({ ...base, costToday: todayVector });
    expect(ended).not.toHaveProperty('partialDay');
    expect(ended.costPerDay.series).not.toContain('model-today');
  });

  it('names no data start from today when the window has ended', () => {
    // A past month has no today: the records starting "today" is not a
    // thing it can say.
    const usage = buildLlmUsage({ ...base, dataBeforeWindow: false });

    expect(usage.dataStart).toBeUndefined();
  });
});
