import { KAGENT_SHARED_SUBJECTS } from './kagent/kagentIdentity';
import { encodeKagentAgentId } from './kagent/kagentSessionRecord';
import type { ModelCostResponse } from './modelCost';
import { counterIncrease, promqlString } from './promql';

/**
 * The pure part of reading the person's model cost from the gateway's cost
 * counter: who the person is, the queries, and what their answers come to.
 * agent-platform-backend's `readModelCost` asks kagent and Mimir and decides
 * with these; fixture mode runs the same queries through the fixture Mimir
 * and decides with these too, so the two cannot drift apart.
 */

/**
 * The person kagent resolved the caller to, as the gateway's `user` label
 * names them — an email address — or undefined when kagent named nobody.
 *
 * `email` first: once the controller re-derives the identity itself, `sub` is
 * the IdP's opaque subject and the email travels beside it. On the line as
 * pinned today the claims are just `{sub: <the email agentgateway set>}`.
 * Only something shaped like an email counts, because the gateway sets
 * nothing else there, and kagent's shared `unsecure` user is no one.
 */
export function callerEmail(claims: unknown): string | undefined {
  if (typeof claims !== 'object' || claims === null) {
    return undefined;
  }
  const { email, sub } = claims as Record<string, unknown>;
  for (const candidate of [email, sub]) {
    if (
      typeof candidate === 'string' &&
      candidate.includes('@') &&
      !KAGENT_SHARED_SUBJECTS.includes(candidate)
    ) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * The gateway's `user` values that name nobody: none at all (a series from
 * before the label) and `unknown` (no identity resolved for the call). A series
 * carrying either is not attributable to a person.
 */
const UNATTRIBUTED_USERS = '|unknown';

/**
 * The PromQL behind the person's cost, over the gateway's cost counter
 * (`costMetric`, `AgentgatewayGenAiClientCostUsdTotal` in gs-common's
 * registry). Built from the identity kagent vouched for, and never from the
 * request — the value is escaped, so even an odd claim cannot change the
 * query's shape.
 *
 * - `byAgent`: the person's spend per calling agent (`agent_namespace`,
 *   `agent`: the pod's namespace and ServiceAccount, `unknown` when the
 *   caller matched no pod). The total is its sum.
 * - `attributed` / `unattributed`: how many of the window's cost series name
 *   a person, and how many do not. Counts of series, no one's figures, and
 *   installation-wide on purpose — they describe the gateway, not a person.
 *   Each scans every cost series over the window, so `attributed` is only
 *   asked when `byAgent` found nothing ({@link needsAttributedCount}): any
 *   series of the person's implies it.
 */
export function modelCostQueries(
  costMetric: string,
  user: string,
  days: number,
) {
  const window = `${days}d`;
  const mine = `${costMetric}{user="${promqlString(user)}"}`;
  return {
    byAgent: `sum by (agent_namespace, agent) ${counterIncrease(mine, window)}`,
    attributed: `count(last_over_time(${costMetric}{user!~"${UNATTRIBUTED_USERS}"}[${window}]))`,
    unattributed: `count(last_over_time(${costMetric}{user=~"${UNATTRIBUTED_USERS}"}[${window}]))`,
  };
}

/** A sample of an instant query's answer, as Mimir writes it. */
export type ModelCostSample = {
  metric?: Record<string, string>;
  value?: [number, string];
};

/** The answers of {@link modelCostQueries}: `attributed` only where asked. */
export type ModelCostAnswers = {
  byAgent: readonly ModelCostSample[];
  unattributed: readonly ModelCostSample[];
  attributed?: readonly ModelCostSample[];
};

/** Whether the `attributed` count is needed: only when `byAgent` found nothing. */
export function needsAttributedCount(
  byAgent: readonly ModelCostSample[],
): boolean {
  return byAgent.length === 0;
}

/** A sample's value, when it is a finite number. */
function finite(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

/** The single value of a `count(...)`, zero when the vector is empty. */
function countOf(samples: readonly ModelCostSample[] | undefined): number {
  return finite(samples?.[0]?.value?.[1]) ?? 0;
}

/** What the answers of {@link modelCostQueries} come to. */
export function modelCostOf(
  answers: ModelCostAnswers,
  options: { days: number; evaluatedAt: number },
): ModelCostResponse {
  const { days, evaluatedAt } = options;
  if (answers.attributed && countOf(answers.attributed) === 0) {
    return { status: 'unavailable', windowDays: days, reason: 'not-recorded' };
  }

  const entries = new Map<string, number>();
  let totalUsd = 0;
  for (const sample of answers.byAgent) {
    const cost = finite(sample.value?.[1]);
    // A series that did not grow in the window is no spend in it. Counting it
    // would make a quiet window read $0.00 while the gateway pod still exports
    // the series, and fall back once a restart drops it.
    if (cost === undefined || cost <= 0) {
      continue;
    }
    totalUsd += cost;
    const { agent_namespace: namespace, agent } = sample.metric ?? {};
    if (!namespace || !agent || agent === 'unknown') {
      continue;
    }
    const agentId = encodeKagentAgentId(namespace, agent);
    entries.set(agentId, (entries.get(agentId) ?? 0) + cost);
  }

  // No priced call is not a cost of zero: an unpriced model records nothing,
  // so "$0.00" would be a claim this data cannot make.
  if (totalUsd <= 0) {
    return { status: 'unavailable', windowDays: days, reason: 'no-spend' };
  }

  return {
    status: 'actual',
    windowDays: days,
    totalUsd,
    byAgent: [...entries]
      .map(([agentId, costUsd]) => ({ agentId, costUsd }))
      .sort((a, b) => b.costUsd - a.costUsd),
    partial: countOf(answers.unattributed) > 0,
    evaluatedAt,
  };
}
