import {
  AgentgatewayCostCatalogLookupsTotal,
  AgentgatewayGenAiClientCostUsdTotal,
  AgentgatewayGenAiClientTokenUsage,
  AgentgatewayGenAiServerRequestDuration,
  AgentgatewayGenAiServerTimePerOutputToken,
  AgentgatewayRequestsTotal,
} from '../mimirMetrics';
import { FIXTURE_INSTALLATION } from '../fixtureMode';
import { DAY, type FixtureAgent } from './builders';
import type { FixtureDataSet } from './dataSet';
import { hashOf } from './random';

/**
 * The agent gateway's metrics in fixture mode: what the platform's
 * agentgateway would have exported for the data set's agents, the series
 * Mimir answers the usage pages from (Usage · Cost, the rates of Usage · Your
 * sessions, the person's model cost). Derived from the data set, never drawn
 * from its random numbers, so adding it left every list as it was:
 *
 * - the agents with traffic are the ready agents of ready organizations, the
 *   ones with sessions, by their namespace and name (the gateway's
 *   `agent_namespace` and `agent`);
 * - the person ({@link FIXTURE_PERSON_EMAIL}) calls the models through their
 *   sessions, on the days each session ran, and two teammates call them every
 *   working day of the {@link GATEWAY_HISTORY_DAYS} before, more lately;
 *   on the first installation a share of one agent's calls names no one
 *   (`unknown`);
 * - every agent runs on its organization's default model
 *   ({@link FIXTURE_AGENT_MODEL}), priced at its list price.
 */

/** The person fixture mode signs in, as the gateway's `user` label names them. */
export const FIXTURE_PERSON_EMAIL = 'guest@example.com';

/** The model the fixture agents run on: their default ModelConfig's `spec.model`. */
export const FIXTURE_AGENT_MODEL = 'gpt-4.1-mini';

/** Others who call the fixture agents. */
const TEAMMATES = ['sorrel@example.com', 'yarrow@example.com'] as const;

/** The gateway's `user` for a call it could attribute to no one. */
const UNATTRIBUTED = 'unknown';

/** How far back the gateway's series reach. */
export const GATEWAY_HISTORY_DAYS = 100;

/** USD per token of {@link FIXTURE_AGENT_MODEL}, by `gen_ai_token_type`. */
const PRICES = {
  input: 0.4e-6,
  input_cache_read: 0.1e-6,
  output: 1.6e-6,
} as const;

type TokenType = keyof typeof PRICES;

/**
 * The upper bounds of the call duration histogram's buckets, in seconds, and
 * the share of calls at or below each.
 */
const DURATION_BUCKETS: readonly [number, number][] = [
  [0.5, 0.02],
  [1, 0.08],
  [2.5, 0.3],
  [5, 0.62],
  [10, 0.86],
  [20, 0.96],
  [40, 0.99],
  [Infinity, 1],
];

/** The same for the seconds per output token of a streamed call. */
const TIME_PER_OUTPUT_TOKEN_BUCKETS: readonly [number, number][] = [
  [0.005, 0.03],
  [0.01, 0.2],
  [0.02, 0.65],
  [0.04, 0.9],
  [0.08, 0.98],
  [Infinity, 1],
];

/** The share of model calls that streamed their answer. */
const STREAMED_SHARE = 0.9;

/** The inference listener's answers: the share of calls with each status. */
const STATUS_SHARES: readonly [string, number][] = [
  ['200', 0.965],
  ['429', 0.025],
  ['500', 0.01],
];

/** One person's model calls through one agent on one UTC day. */
export type FixtureGatewayDay = {
  installation: string;
  namespace: string;
  agent: string;
  model: string;
  user: string;
  /** The day's start (UTC midnight), in ms. */
  day: number;
  calls: number;
  /** Every input token, the ones read from the cache included. */
  input: number;
  /** The input tokens read from the cache. */
  cacheRead: number;
  output: number;
};

/**
 * One series of a counter (a counter metric, or a histogram's `_sum`,
 * `_count` or `_bucket`): its labels, `__name__` among them, and its value at
 * each point, oldest first. Between two points the value grows linearly;
 * after the last it stays. The series exists from its first point on.
 */
export type FixtureCounterSeries = {
  labels: Readonly<Record<string, string>>;
  points: readonly (readonly [ms: number, value: number])[];
};

/** A counter series' value at `ms`, or undefined before it exists. */
export function counterValueAt(
  series: FixtureCounterSeries,
  ms: number,
): number | undefined {
  const { points } = series;
  if (points.length === 0 || ms < points[0][0]) {
    return undefined;
  }
  // Binary search for the last point at or before `ms`.
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (points[middle][0] <= ms) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  const [at, value] = points[low];
  const next = points[low + 1];
  if (!next || next[0] === at) {
    return value;
  }
  return value + ((next[1] - value) * (ms - at)) / (next[0] - at);
}

/**
 * How much a counter series grew from `startMs` to `endMs`, counting from its
 * first point where it started inside; undefined when it does not exist in
 * the range.
 */
export function counterIncreaseOf(
  series: FixtureCounterSeries,
  startMs: number,
  endMs: number,
): number | undefined {
  const first = series.points[0]?.[0];
  if (first === undefined || endMs < first) {
    return undefined;
  }
  return (
    counterValueAt(series, endMs)! -
    counterValueAt(series, Math.max(startMs, first))!
  );
}

/**
 * A label set's identity, its labels in name order: the key the series, the
 * evaluator's vector matching and the range answers group by.
 */
export function labelKey(labels: Readonly<Record<string, string>>): string {
  return JSON.stringify(
    Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** A number in [0, 1) from the given parts, the same every time. */
function unit(...parts: (string | number)[]): number {
  return hashOf(parts.join('|')) / 4294967296;
}

function startOfDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

/** The agents with model calls: the ones with sessions. */
function activeAgents(data: FixtureDataSet, installation: string) {
  const ready = new Set(
    data.organizations
      .filter(o => o.installation === installation && o.state === 'ready')
      .map(o => o.name),
  );
  return data.agents.filter(
    (agent: FixtureAgent) =>
      agent.installation === installation &&
      agent.state === 'ready' &&
      ready.has(agent.organization),
  );
}

/** Tokens and calls for an amount of input, the same for the same key. */
function callsOf(
  key: string,
  input: number,
): Pick<FixtureGatewayDay, 'calls' | 'input' | 'cacheRead' | 'output'> {
  const rounded = Math.round(input);
  return {
    calls: Math.max(1, Math.round(rounded / (5000 + 4000 * unit(key, 'c')))),
    input: rounded,
    cacheRead: Math.round(rounded * (0.3 + 0.35 * unit(key, 'r'))),
    output: Math.round(rounded * (0.03 + 0.05 * unit(key, 'o'))),
  };
}

/**
 * The model calls of one installation, one record per person, agent and day
 * with calls, over the {@link GATEWAY_HISTORY_DAYS} up to `now`. Today's
 * records hold the calls until `now`.
 */
export function gatewayDaysOf(
  data: FixtureDataSet,
  installation: string,
  now: number,
): FixtureGatewayDay[] {
  const today = startOfDay(now);
  const firstDay = today - (GATEWAY_HISTORY_DAYS - 1) * DAY;
  const todayShare = (now - today) / DAY;
  const agents = activeAgents(data, installation);
  const days: FixtureGatewayDay[] = [];
  const record = (
    agent: { namespace: string; name: string },
    user: string,
    day: number,
    input: number,
  ) => {
    if (input < 1) {
      return;
    }
    const key = `${installation}/${agent.namespace}/${agent.name}/${user}/${day}`;
    days.push({
      installation,
      namespace: agent.namespace,
      agent: agent.name,
      model: FIXTURE_AGENT_MODEL,
      user,
      day,
      ...callsOf(key, input),
    });
  };

  // The teammates: most working days, a few weekends, more lately.
  for (const agent of agents) {
    for (const user of TEAMMATES) {
      const id = [installation, agent.namespace, agent.name, user];
      const weight = 0.4 + 1.2 * unit(...id);
      for (let day = firstDay; day <= today; day += DAY) {
        const weekday = new Date(day).getUTCDay();
        const weekend = weekday === 0 || weekday === 6;
        const chance = unit(...id, day, 'active');
        if (chance > (weekend ? 0.15 : 0.7)) {
          continue;
        }
        const trend = 0.35 + (0.65 * (day - firstDay)) / (today - firstDay);
        const share = day === today ? todayShare : 1;
        record(
          agent,
          user,
          day,
          weight * trend * share * (20000 + 160000 * unit(...id, day, 'input')),
        );
      }
    }
  }

  // On the first installation, a share of the first agent's calls names no
  // one, so the person's cost there covers only part of the calls.
  const [unattributed] = agents;
  if (unattributed && installation === FIXTURE_INSTALLATION) {
    for (let day = firstDay; day <= today; day += DAY) {
      const id = [installation, unattributed.namespace, unattributed.name];
      if (unit(...id, day, UNATTRIBUTED) < 0.25) {
        const share = day === today ? todayShare : 1;
        record(
          unattributed,
          UNATTRIBUTED,
          day,
          share * (5000 + 30000 * unit(...id, day, 'input')),
        );
      }
    }
  }

  // The person: their sessions' calls, spread over the days each ran.
  const sessionInput = new Map<string, number>();
  for (const session of data.sessions) {
    if (session.installation !== installation) {
      continue;
    }
    const start = Math.max(startOfDay(Date.parse(session.createdAt)), firstDay);
    const end = Math.min(startOfDay(Date.parse(session.updatedAt)), today);
    if (end < start) {
      continue;
    }
    const total = 5000 + 15000 * unit(session.id, 'input');
    const spanDays = (end - start) / DAY + 1;
    for (let day = start; day <= end; day += DAY) {
      const key = `${session.agent.namespace}/${session.agent.name}/${day}`;
      sessionInput.set(key, (sessionInput.get(key) ?? 0) + total / spanDays);
    }
  }
  for (const [key, input] of sessionInput) {
    const [namespace, name, day] = key.split('/');
    record({ namespace, name }, FIXTURE_PERSON_EMAIL, Number(day), input);
  }

  return days;
}

/** Collects each series' growth per day. */
class SeriesBuilder {
  private readonly series = new Map<
    string,
    { labels: Record<string, string>; growth: Map<number, number> }
  >();

  constructor(
    private readonly lastDay: number,
    private readonly now: number,
  ) {}

  add(labels: Record<string, string>, day: number, value: number): void {
    if (value === 0) {
      return;
    }
    const key = labelKey(labels);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { labels, growth: new Map() };
      this.series.set(key, entry);
    }
    entry.growth.set(day, (entry.growth.get(day) ?? 0) + value);
  }

  /**
   * The series, each from the start of the first day it grew, at 0, as the
   * gateway creates a series on its first call: a point at every day's start
   * and the last at `now`, so a day's growth spreads over it.
   */
  build(): FixtureCounterSeries[] {
    return [...this.series.values()].map(({ labels, growth }) => {
      const points: [number, number][] = [];
      let value = 0;
      const firstDay = Math.min(...growth.keys());
      for (let day = firstDay; day <= this.lastDay; day += DAY) {
        points.push([day, value]);
        value += growth.get(day) ?? 0;
      }
      points.push([Math.max(this.now, this.lastDay + 1), value]);
      return { labels, points };
    });
  }
}

const TOKEN_USAGE = AgentgatewayGenAiClientTokenUsage.name;
const COST = AgentgatewayGenAiClientCostUsdTotal.name;
const REQUEST_DURATION = AgentgatewayGenAiServerRequestDuration.name;
const TIME_PER_OUTPUT_TOKEN = AgentgatewayGenAiServerTimePerOutputToken.name;
const REQUESTS = AgentgatewayRequestsTotal.name;
const CATALOG_LOOKUPS = AgentgatewayCostCatalogLookupsTotal.name;

/** The `le` label of a bucket bound, as Prometheus writes it. */
function leOf(bound: number): string {
  return bound === Infinity ? '+Inf' : String(bound);
}

/**
 * Every gateway series of one installation, as Mimir holds them: built from
 * {@link gatewayDaysOf}, so each figure the pages read (cost, tokens, calls,
 * durations, statuses, price lookups) adds up to the same calls.
 */
export function gatewaySeriesOf(
  data: FixtureDataSet,
  installation: string,
  now: number,
): FixtureCounterSeries[] {
  const builder = new SeriesBuilder(startOfDay(now), now);
  const gateway = { gateway: 'agentgateway' };

  for (const record of gatewayDaysOf(data, installation, now)) {
    const { day, calls } = record;
    const call = {
      ...gateway,
      agent_namespace: record.namespace,
      agent: record.agent,
      gen_ai_response_model: record.model,
    };
    const tokens: Record<TokenType, number> = {
      input: record.input,
      input_cache_read: record.cacheRead,
      output: record.output,
    };
    for (const type of Object.keys(tokens) as TokenType[]) {
      const labels = { ...call, gen_ai_token_type: type, user: record.user };
      // `input` counts the cached tokens too, priced at the cache rate.
      const priced =
        type === 'input'
          ? tokens.input - tokens.input_cache_read
          : tokens[type];
      builder.add(
        { __name__: `${TOKEN_USAGE}_sum`, ...labels },
        day,
        tokens[type],
      );
      builder.add({ __name__: `${TOKEN_USAGE}_count`, ...labels }, day, calls);
      builder.add({ __name__: COST, ...labels }, day, priced * PRICES[type]);
    }
    builder.add({ __name__: `${REQUEST_DURATION}_count`, ...call }, day, calls);
    for (const [bound, share] of DURATION_BUCKETS) {
      builder.add(
        { __name__: `${REQUEST_DURATION}_bucket`, ...call, le: leOf(bound) },
        day,
        calls * share,
      );
    }
    for (const [bound, share] of TIME_PER_OUTPUT_TOKEN_BUCKETS) {
      builder.add(
        {
          __name__: `${TIME_PER_OUTPUT_TOKEN}_bucket`,
          ...call,
          le: leOf(bound),
        },
        day,
        calls * STREAMED_SHARE * share,
      );
    }
    for (const [status, share] of STATUS_SHARES) {
      builder.add(
        { __name__: REQUESTS, ...gateway, listener: 'llm', status },
        day,
        calls * share,
      );
    }
    // The connectors' traffic on another listener, which the error rate
    // must leave out.
    builder.add(
      { __name__: REQUESTS, ...gateway, listener: 'mcp', status: '500' },
      day,
      calls * 0.2,
    );
    builder.add(
      {
        __name__: CATALOG_LOOKUPS,
        ...gateway,
        gen_ai_request_model: record.model,
        gen_ai_response_model: record.model,
        status: 'Exact',
      },
      day,
      calls,
    );
  }
  return builder.build();
}

const built = new WeakMap<
  FixtureDataSet,
  Map<string, FixtureCounterSeries[]>
>();

/**
 * {@link gatewaySeriesOf} for a data set, up to the time it counts back from
 * (`now`), built once per installation, so every fixture that reads the
 * gateway (the fixture Mimir, the person's model cost) reads the same
 * figures, the same for the same seed and `now`.
 */
export function gatewaySeries(
  data: FixtureDataSet,
  installation: string,
): FixtureCounterSeries[] {
  let byInstallation = built.get(data);
  if (!byInstallation) {
    byInstallation = new Map();
    built.set(data, byInstallation);
  }
  let series = byInstallation.get(installation);
  if (!series) {
    series = gatewaySeriesOf(data, installation, data.now);
    byInstallation.set(installation, series);
  }
  return series;
}
