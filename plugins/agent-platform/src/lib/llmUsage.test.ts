import type {
  MimirMatrixSample,
  MimirMetricSample,
} from '@giantswarm/backstage-plugin-gs';
import type { AgentRow } from '../components/AgentsDataProvider';
import {
  applyTodayPartial,
  buildLlmUsage,
  cacheReadShare,
  foldSeries,
  hasAnyLlmUsage,
  reduceByAgent,
  reduceByModel,
  reduceDaily,
  reduceReliability,
  reduceTokenTypes,
  reduceUnpricedModels,
} from './llmUsage';

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

function sample(
  metric: Record<string, string>,
  value: string,
): MimirMetricSample {
  return { metric, value: [1757462400, value] };
}

const hrefFor = (row: AgentRow) => `/agents/${row.installation}/${row.name}`;

const byAgentOptions = {
  agents: [agent()],
  installation: 'gazelle',
  hrefFor,
  unknownLabel: 'Unattributed',
};

describe('reduceByAgent', () => {
  it('joins the gateway labels to the agent CRs and links the matches', () => {
    const rows = reduceByAgent({
      ...byAgentOptions,
      cost: [sample({ agent_namespace: 'kagent', agent: 'sre-agent' }, '4.5')],
      tokens: [
        sample({ agent_namespace: 'kagent', agent: 'sre-agent' }, '1000000'),
      ],
      calls: [sample({ agent_namespace: 'kagent', agent: 'sre-agent' }, '12')],
    });

    expect(rows).toEqual([
      {
        id: 'kagent|sre-agent',
        namespace: 'kagent',
        agent: 'sre-agent',
        label: 'SRE Agent',
        href: '/agents/gazelle/SRE Agent',
        tokens: 1_000_000,
        calls: 12,
        costUsd: 4.5,
        sharePct: 100,
      },
    ]);
  });

  it('sums the token types a single agent row is split across', () => {
    // The query groups by token type as well as by agent, so one agent arrives
    // as four series. Failing to sum them would show a quarter of the truth.
    const labels = { agent_namespace: 'kagent', agent: 'sre-agent' };
    const rows = reduceByAgent({
      ...byAgentOptions,
      cost: [
        sample({ ...labels, gen_ai_token_type: 'input' }, '3'),
        sample({ ...labels, gen_ai_token_type: 'output' }, '1.5'),
      ],
      tokens: [
        sample({ ...labels, gen_ai_token_type: 'input' }, '900000'),
        sample({ ...labels, gen_ai_token_type: 'input_cache_read' }, '50000'),
        sample({ ...labels, gen_ai_token_type: 'output' }, '50000'),
      ],
      calls: [sample(labels, '12')],
    });

    expect(rows[0].costUsd).toBe(4.5);
    expect(rows[0].tokens).toBe(1_000_000);
  });

  it('keeps a label that matches no CR, unlinked, showing namespace/agent', () => {
    const rows = reduceByAgent({
      ...byAgentOptions,
      cost: [sample({ agent_namespace: 'kagent', agent: 'deleted' }, '1')],
      tokens: undefined,
      calls: undefined,
    });

    expect(rows[0].label).toBe('kagent/deleted');
    expect(rows[0].href).toBeUndefined();
  });

  it("renders the gateway's `unknown` agent as the caller's unknown label", () => {
    const rows = reduceByAgent({
      ...byAgentOptions,
      cost: [sample({ agent_namespace: 'kagent', agent: 'unknown' }, '1')],
      tokens: undefined,
      calls: undefined,
    });

    expect(rows[0].label).toBe('Unattributed');
    expect(rows[0].href).toBeUndefined();
  });

  it('does not match a same-named agent on another installation', () => {
    const rows = reduceByAgent({
      ...byAgentOptions,
      agents: [agent({ installation: 'elephant' })],
      cost: [sample({ agent_namespace: 'kagent', agent: 'sre-agent' }, '1')],
      tokens: undefined,
      calls: undefined,
    });

    expect(rows[0].label).toBe('kagent/sre-agent');
  });

  it('appears once per namespace when two namespaces hold the same name', () => {
    const rows = reduceByAgent({
      ...byAgentOptions,
      cost: [
        sample({ agent_namespace: 'kagent', agent: 'sre-agent' }, '1'),
        sample({ agent_namespace: 'other', agent: 'sre-agent' }, '3'),
      ],
      tokens: undefined,
      calls: undefined,
    });

    expect(rows.map(row => [row.label, row.costUsd])).toEqual([
      ['other/sre-agent', 3],
      ['SRE Agent', 1],
    ]);
  });

  it('ranks by spend, then tokens, then label', () => {
    const rows = reduceByAgent({
      ...byAgentOptions,
      agents: [],
      cost: [
        sample({ agent_namespace: 'ns', agent: 'b' }, '1'),
        sample({ agent_namespace: 'ns', agent: 'a' }, '1'),
        sample({ agent_namespace: 'ns', agent: 'c' }, '9'),
      ],
      tokens: undefined,
      calls: undefined,
    });

    expect(rows.map(row => row.agent)).toEqual(['c', 'a', 'b']);
  });

  it('gives no share when nothing was priced', () => {
    const rows = reduceByAgent({
      ...byAgentOptions,
      cost: undefined,
      tokens: [
        sample({ agent_namespace: 'kagent', agent: 'sre-agent' }, '1000'),
      ],
      calls: undefined,
    });

    expect(rows[0].sharePct).toBeUndefined();
    expect(rows[0].tokens).toBe(1000);
  });

  it('skips a NaN sample rather than poisoning the total', () => {
    const rows = reduceByAgent({
      ...byAgentOptions,
      cost: [
        sample({ agent_namespace: 'kagent', agent: 'sre-agent' }, '2'),
        sample({ agent_namespace: 'kagent', agent: 'sre-agent' }, 'NaN'),
      ],
      tokens: undefined,
      calls: undefined,
    });

    expect(rows[0].costUsd).toBe(2);
  });
});

describe('reduceByModel', () => {
  it('derives the blended price and the average call size', () => {
    const rows = reduceByModel({
      cost: [sample({ gen_ai_response_model: 'claude-sonnet-5' }, '6')],
      tokens: [sample({ gen_ai_response_model: 'claude-sonnet-5' }, '2000000')],
      calls: [sample({ gen_ai_response_model: 'claude-sonnet-5' }, '20')],
      unknownLabel: 'Unknown model',
    });

    expect(rows[0]).toMatchObject({
      model: 'claude-sonnet-5',
      usdPerMillion: 3,
      avgTokensPerCall: 100_000,
      sharePct: 100,
    });
  });

  it('labels a series with no model label and omits derived ratios', () => {
    const rows = reduceByModel({
      cost: undefined,
      tokens: [sample({}, '0')],
      calls: [sample({}, '0')],
      unknownLabel: 'Unknown model',
    });

    expect(rows[0].model).toBe('Unknown model');
    expect(rows[0].usdPerMillion).toBeUndefined();
    expect(rows[0].avgTokensPerCall).toBeUndefined();
  });
});

describe('reduceTokenTypes and cacheReadShare', () => {
  it('names the four known types and pools anything new under other', () => {
    const types = reduceTokenTypes({
      input: 100,
      output: 20,
      input_cache_read: 800,
      input_cache_write: 80,
      reasoning: 5,
    });

    expect(types).toEqual({
      input: 100,
      output: 20,
      inputCacheRead: 800,
      inputCacheWrite: 80,
      other: 5,
    });
  });

  it('measures cache reads against cache-eligible input only', () => {
    // Output must not dilute the share — it is not cache-eligible, so
    // including it would make heavy generation look like broken caching.
    const share = cacheReadShare({
      input: 100,
      output: 10_000,
      inputCacheRead: 300,
      inputCacheWrite: 100,
      other: 0,
    });

    expect(share).toBeCloseTo(60);
  });

  it('has no share when there is no input traffic', () => {
    expect(
      cacheReadShare({
        input: 0,
        output: 0,
        inputCacheRead: 0,
        inputCacheWrite: 0,
        other: 0,
      }),
    ).toBeUndefined();
  });
});

describe('reduceReliability', () => {
  it('counts every non-2xx as an error and 429 separately', () => {
    const reliability = reduceReliability({
      requestsByStatus: [
        sample({ status: '200' }, '900'),
        sample({ status: '429' }, '80'),
        sample({ status: '500' }, '20'),
      ],
      p50: [sample({}, '1.5')],
      p95: [sample({}, '12')],
    });

    expect(reliability).toEqual({
      totalRequests: 1000,
      errorRequests: 100,
      errorRatePct: 10,
      rateLimited: 80,
      p50Seconds: 1.5,
      p95Seconds: 12,
    });
  });

  it('does not count a series with no status label as an error', () => {
    // One unlabelled series was enough to read the Gateway health card as a
    // 100% error rate, in the error tone, on an installation where nothing was
    // failing — `labels.status ?? ''` lands under `''`, which failed the 2xx
    // test.
    const reliability = reduceReliability({
      requestsByStatus: [sample({}, '500'), sample({ status: '200' }, '500')],
      p50: undefined,
      p95: undefined,
    });

    expect(reliability.totalRequests).toBe(1000);
    expect(reliability.errorRequests).toBe(0);
    expect(reliability.errorRatePct).toBe(0);
  });

  it('does not count 3xx as an error', () => {
    const reliability = reduceReliability({
      requestsByStatus: [
        sample({ status: '200' }, '90'),
        sample({ status: '302' }, '10'),
      ],
      p50: undefined,
      p95: undefined,
    });

    expect(reliability.errorRequests).toBe(0);
  });

  it('still counts 4xx and 5xx', () => {
    const reliability = reduceReliability({
      requestsByStatus: [
        sample({ status: '200' }, '80'),
        sample({ status: '404' }, '10'),
        sample({ status: '503' }, '10'),
      ],
      p50: undefined,
      p95: undefined,
    });

    expect(reliability.errorRequests).toBe(20);
    expect(reliability.errorRatePct).toBe(20);
  });

  it('reports no quantile for an empty histogram instead of zero', () => {
    // histogram_quantile over a histogram with no observations is NaN, which
    // must not render as a confident 0ms.
    const reliability = reduceReliability({
      requestsByStatus: undefined,
      p50: [sample({}, 'NaN')],
      p95: [],
    });

    expect(reliability.p50Seconds).toBeUndefined();
    expect(reliability.p95Seconds).toBeUndefined();
    expect(reliability.errorRatePct).toBeUndefined();
  });
});

describe('reduceUnpricedModels', () => {
  it('ranks the unresolved lookups and drops zero-valued series', () => {
    const rows = reduceUnpricedModels([
      sample(
        {
          gen_ai_request_model: 'gpt-5',
          gen_ai_response_model: 'gpt-5',
          status: 'Missing',
        },
        '4',
      ),
      sample(
        {
          gen_ai_request_model: 'old',
          gen_ai_response_model: 'old',
          status: 'Unpriced',
        },
        '0',
      ),
      sample(
        {
          gen_ai_request_model: 'a',
          gen_ai_response_model: 'b',
          status: 'Unpriced',
        },
        '9',
      ),
    ]);

    expect(rows.map(row => [row.responseModel, row.lookups])).toEqual([
      ['b', 9],
      ['gpt-5', 4],
    ]);
  });

  it('is empty on a healthy installation', () => {
    expect(reduceUnpricedModels([])).toEqual([]);
    expect(reduceUnpricedModels(undefined)).toEqual([]);
  });
});

describe('reduceDaily', () => {
  const DAY = 86400;
  // Midnight UTC on 2026-09-05.
  const midnight = Date.parse('2026-09-05T00:00:00Z') / 1000;

  function matrix(
    metric: Record<string, string>,
    values: [number, string][],
  ): MimirMatrixSample {
    return { metric, values };
  }

  it('labels each point by the day it covers, not the day it closes', () => {
    // increase(...[1d]) evaluated at midnight of the 5th totals the 4th.
    const daily = reduceDaily(
      [matrix({ gen_ai_response_model: 'sonnet' }, [[midnight, '3']])],
      { label: labels => labels.gen_ai_response_model },
    );

    expect(daily.rows).toEqual([{ day: '2026-09-04', sonnet: 3 }]);
  });

  it('fills a gap so N bars always mean N days', () => {
    const daily = reduceDaily(
      [
        matrix({ gen_ai_response_model: 'sonnet' }, [
          [midnight, '1'],
          [midnight + 3 * DAY, '4'],
        ]),
      ],
      { label: labels => labels.gen_ai_response_model },
    );

    expect(daily.rows).toEqual([
      { day: '2026-09-04', sonnet: 1 },
      { day: '2026-09-05', sonnet: 0 },
      { day: '2026-09-06', sonnet: 0 },
      { day: '2026-09-07', sonnet: 4 },
    ]);
  });

  it('gives every row every series key, and ranks series by total', () => {
    const daily = reduceDaily(
      [
        matrix({ m: 'small' }, [[midnight, '1']]),
        matrix({ m: 'big' }, [[midnight + DAY, '50']]),
      ],
      { label: labels => labels.m },
    );

    expect(daily.series).toEqual(['big', 'small']);
    expect(daily.rows).toEqual([
      { day: '2026-09-04', big: 0, small: 1 },
      { day: '2026-09-05', big: 50, small: 0 },
    ]);
  });

  it('renders one row per day of the window, not per day with data', () => {
    // The regression this exists for: a metric a day old produced a
    // single-row frame, and recharts drew that one bar across the whole
    // chart — reading as one enormous day rather than as a day of history.
    // The axis has to be the window the page claims.
    const daily = reduceDaily([matrix({ m: 'sonnet' }, [[midnight, '3']])], {
      label: labels => labels.m,
      days: [
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
      ],
    });

    expect(daily.rows).toHaveLength(5);
    expect(daily.rows.map(row => row.day)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ]);
    // The one day that carried data still lands on the day it covers.
    expect(daily.rows.map(row => row.sonnet)).toEqual([0, 0, 0, 3, 0]);
  });

  it('drops a day the window does not include', () => {
    // Mimir answering outside the requested window would otherwise widen the
    // axis past what the page says it is showing.
    const daily = reduceDaily([matrix({ m: 'sonnet' }, [[midnight, '3']])], {
      label: labels => labels.m,
      days: ['2026-09-20', '2026-09-21'],
    });

    expect(daily.rows.map(row => row.sonnet)).toEqual([0, 0]);
  });

  it('is empty for an empty matrix', () => {
    expect(reduceDaily(undefined, { label: () => 'x' })).toEqual({
      rows: [],
      series: [],
    });
  });
});

describe('applyTodayPartial', () => {
  const daily = {
    rows: [
      { day: '2026-09-08', sonnet: 10 },
      { day: '2026-09-09', sonnet: 20 },
      { day: '2026-09-10', sonnet: 0 },
    ],
    series: ['sonnet'],
  };

  it("fills today's row from the partial instant query", () => {
    // The range query stops at yesterday on purpose, so today arrives from an
    // instant query over elapsed-time-since-midnight — real spend so far,
    // not a part-day extrapolated to a whole one.
    const applied = applyTodayPartial(daily, {
      day: '2026-09-10',
      samples: [sample({ gen_ai_response_model: 'sonnet' }, '7')],
      label: labels => labels.gen_ai_response_model,
    });

    expect(applied.rows).toEqual([
      { day: '2026-09-08', sonnet: 10 },
      { day: '2026-09-09', sonnet: 20 },
      { day: '2026-09-10', sonnet: 7 },
    ]);
  });

  it('leaves the earlier rows alone', () => {
    const applied = applyTodayPartial(daily, {
      day: '2026-09-10',
      samples: [sample({ gen_ai_response_model: 'sonnet' }, '7')],
      label: labels => labels.gen_ai_response_model,
    });

    expect(applied.rows.slice(0, 2)).toEqual(daily.rows.slice(0, 2));
  });

  it('gives every row a zero for a series that only appeared today', () => {
    // recharts renders a missing key as a gap rather than as nothing, so a
    // model first seen today has to be back-filled across the whole frame.
    const applied = applyTodayPartial(daily, {
      day: '2026-09-10',
      samples: [
        sample({ gen_ai_response_model: 'sonnet' }, '7'),
        sample({ gen_ai_response_model: 'haiku' }, '2'),
      ],
      label: labels => labels.gen_ai_response_model,
    });

    expect(applied.series).toEqual(['sonnet', 'haiku']);
    expect(applied.rows).toEqual([
      { day: '2026-09-08', sonnet: 10, haiku: 0 },
      { day: '2026-09-09', sonnet: 20, haiku: 0 },
      { day: '2026-09-10', sonnet: 7, haiku: 2 },
    ]);
  });

  it('is a no-op when nothing has happened today yet', () => {
    expect(
      applyTodayPartial(daily, {
        day: '2026-09-10',
        samples: [],
        label: labels => labels.gen_ai_response_model,
      }),
    ).toBe(daily);
  });
});

describe('buildLlmUsage', () => {
  const labels = { agent_namespace: 'kagent', agent: 'sre-agent' };
  const base = {
    agents: [agent()],
    installation: 'gazelle',
    hrefFor,
    unknownAgentLabel: 'Unattributed',
    unknownModelLabel: 'Unknown model',
    calls: [sample({ ...labels, gen_ai_response_model: 'sonnet' }, '10')],
    requestsByStatus: [sample({ status: '200' }, '10')],
    p50: [sample({}, '2')],
    p95: [sample({}, '9')],
    unpricedLookups: [],
    costPerDay: [],
    tokensPerDay: [],
    days: ['2026-09-09', '2026-09-10'],
    today: '2026-09-10',
    costToday: [],
    tokensToday: [],
  };

  it('reduces one pair of vectors into totals, agents, models and rates', () => {
    const usage = buildLlmUsage({
      ...base,
      cost: [
        sample(
          {
            ...labels,
            gen_ai_response_model: 'sonnet',
            gen_ai_token_type: 'input',
          },
          '3',
        ),
        sample(
          {
            ...labels,
            gen_ai_response_model: 'sonnet',
            gen_ai_token_type: 'output',
          },
          '15',
        ),
      ],
      tokens: [
        sample(
          {
            ...labels,
            gen_ai_response_model: 'sonnet',
            gen_ai_token_type: 'input',
          },
          '1000000',
        ),
        sample(
          {
            ...labels,
            gen_ai_response_model: 'sonnet',
            gen_ai_token_type: 'output',
          },
          '1000000',
        ),
      ],
    });

    expect(usage.totals).toMatchObject({
      costUsd: 18,
      tokens: 2_000_000,
      calls: 10,
      agents: 1,
      models: 1,
      usdPerMillion: 9,
      avgTokensPerCall: 200_000,
    });
    expect(usage.rates.input).toBeCloseTo(3 / 1_000_000);
    expect(usage.rates.output).toBeCloseTo(15 / 1_000_000);
    expect(usage.byAgent[0].label).toBe('SRE Agent');
    expect(usage.byModel[0].model).toBe('sonnet');
  });

  it('reports only a blended rate when cost carries no token type', () => {
    const usage = buildLlmUsage({
      ...base,
      cost: [sample({ ...labels, gen_ai_response_model: 'sonnet' }, '18')],
      tokens: [
        sample(
          {
            ...labels,
            gen_ai_response_model: 'sonnet',
            gen_ai_token_type: 'input',
          },
          '2000000',
        ),
      ],
    });

    expect(usage.rates.input).toBeUndefined();
    expect(usage.rates.blended).toBeCloseTo(18 / 2_000_000);
  });

  it('has no usage at all for empty responses', () => {
    const usage = buildLlmUsage({
      ...base,
      calls: [],
      cost: [],
      tokens: [],
      requestsByStatus: [],
    });

    expect(hasAnyLlmUsage(usage)).toBe(false);
    expect(usage.totals.agents).toBe(0);
  });

  it('counts as usage when tokens flowed but nothing was priced', () => {
    const usage = buildLlmUsage({
      ...base,
      cost: [],
      tokens: [sample({ ...labels }, '5000')],
    });

    expect(hasAnyLlmUsage(usage)).toBe(true);
    expect(usage.totals.usdPerMillion).toBeUndefined();
    expect(usage.rates.blended).toBeUndefined();
  });
});

describe('foldSeries', () => {
  const rows = [
    { day: '2026-09-04', a: 8, b: 4, c: 2, d: 1 },
    { day: '2026-09-05', a: 8, b: 4, c: 2, d: 1 },
  ];
  const daily = { rows, series: ['a', 'b', 'c', 'd'] };

  it('leaves a series list inside the cap untouched', () => {
    expect(foldSeries(daily, 4, 'Other')).toBe(daily);
    expect(foldSeries(daily, 9, 'Other')).toBe(daily);
  });

  it('pools everything past the cap under one key', () => {
    // The cap exists because the categorical palette is eight validated hues
    // and stops there: a ninth would have to be generated, at an unverified
    // distance from an existing slot.
    expect(foldSeries(daily, 2, 'Other')).toEqual({
      series: ['a', 'b', 'Other'],
      rows: [
        { day: '2026-09-04', a: 8, b: 4, Other: 3 },
        { day: '2026-09-05', a: 8, b: 4, Other: 3 },
      ],
    });
  });

  it("keeps each day's total unchanged, which is the point of pooling", () => {
    const folded = foldSeries(daily, 1, 'Other');
    const totalOf = (row: Record<string, unknown>, keys: string[]) =>
      keys.reduce(
        (acc, key) => acc + (typeof row[key] === 'number' ? row[key] : 0),
        0,
      );

    folded.rows.forEach((row, index) => {
      expect(totalOf(row, folded.series)).toBe(
        totalOf(rows[index], daily.series),
      );
    });
  });

  it('never treats the day key as a series value', () => {
    // `LlmDailyEntry` admits `string | number`, so a naive sum would
    // concatenate the date into the pooled total.
    const folded = foldSeries(daily, 1, 'Other');

    expect(folded.rows[0].Other).toBe(7);
    expect(folded.rows[0].day).toBe('2026-09-04');
  });

  it('fills a key a day happens to be missing with zero', () => {
    const sparse = {
      rows: [{ day: '2026-09-04', a: 5 }],
      series: ['a', 'b', 'c'],
    };

    expect(foldSeries(sparse, 1, 'Other')).toEqual({
      series: ['a', 'Other'],
      rows: [{ day: '2026-09-04', a: 5, Other: 0 }],
    });
  });
});
