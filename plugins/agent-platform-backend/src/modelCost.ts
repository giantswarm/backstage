import { LoggerService } from '@backstage/backend-plugin-api';
import { AuthenticationError, NotFoundError } from '@backstage/errors';
import {
  counterIncrease,
  encodeKagentAgentId,
  KAGENT_SHARED_SUBJECTS,
  ModelCostResponse,
  promqlString,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { AgentgatewayGenAiClientCostUsdTotal as Cost } from '@giantswarm/backstage-plugin-gs-common';
import type {
  MimirQueryResponse,
  MimirService,
} from '@giantswarm/backstage-plugin-gs-node';

/** The part of `MimirService` the cost read needs; a stub in tests. */
export type MimirQuerier = Pick<MimirService, 'query'>;

/** The part of `KagentClient` the cost read needs. */
export type IdentityReader = {
  getMe(options: { userToken?: string }): Promise<unknown>;
};

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
 * The PromQL behind the person's cost. Built here, from the identity kagent
 * vouched for, and never from the request — the value is escaped, so even an
 * odd claim cannot change the query's shape.
 *
 * - `byAgent`: the person's spend per calling agent (`agent_namespace`,
 *   `agent`: the pod's namespace and ServiceAccount, `unknown` when the
 *   caller matched no pod). The total is its sum.
 * - `labelled` / `unlabelled`: whether the window's cost series carry a
 *   `user` at all, and whether some do not. Counts of series, no one's
 *   figures, and installation-wide on purpose — they describe the gateway,
 *   not a person.
 */
export function modelCostQueries(user: string, days: number) {
  const window = `${days}d`;
  const mine = `${Cost.name}{user="${promqlString(user)}"}`;
  return {
    byAgent: `sum by (agent_namespace, agent) ${counterIncrease(mine, window)}`,
    labelled: `count(last_over_time(${Cost.name}{user!=""}[${window}]))`,
    unlabelled: `count(last_over_time(${Cost.name}{user=""}[${window}]))`,
  };
}

/** A sample's value, when it is a finite number. */
function finite(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

/** The single value of a `count(...)`, zero when the vector is empty. */
function countOf(response: MimirQueryResponse): number {
  return finite(response.data?.result?.[0]?.value?.[1]) ?? 0;
}

/**
 * The person's own model cost on one installation over the last `days` days.
 *
 * Answers `unavailable` with a reason, rather than an error, for every
 * outcome the page falls back to the estimate on, so none of them reaches a
 * 5xx (`MiddlewareFactory.error()` forwards those to Sentry). Two errors do
 * propagate, because they mean something different: no Mimir configured for
 * the installation (404 — the page's "no observability stack" case) and a
 * token Mimir refused (401).
 */
export async function readModelCost(options: {
  identity: IdentityReader;
  mimir: MimirQuerier;
  installation: string;
  userToken: string;
  days: number;
  logger: LoggerService;
  now?: () => number;
}): Promise<ModelCostResponse> {
  const { identity, mimir, installation, userToken, days, logger } = options;
  const now = options.now ?? Date.now;

  const user = callerEmail(await identity.getMe({ userToken }));
  if (!user) {
    return { status: 'unavailable', windowDays: days, reason: 'no-identity' };
  }

  const queries = modelCostQueries(user, days);
  const run = (query: string) =>
    mimir.query({
      installationName: installation,
      query,
      oidcToken: userToken,
    });

  let byAgent: MimirQueryResponse;
  let labelled: MimirQueryResponse;
  let unlabelled: MimirQueryResponse;
  try {
    [byAgent, labelled, unlabelled] = await Promise.all([
      run(queries.byAgent),
      run(queries.labelled),
      run(queries.unlabelled),
    ]);
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      error instanceof AuthenticationError
    ) {
      throw error;
    }
    // Handled: the page shows the estimate and says why. No installation or
    // user in the message, so one cause stays one line in the logs.
    logger.info('Could not read the model cost from Mimir', {
      installation,
      error: String(error),
    });
    return { status: 'unavailable', windowDays: days, reason: 'unreadable' };
  }

  if (countOf(labelled) === 0) {
    return { status: 'unavailable', windowDays: days, reason: 'not-recorded' };
  }

  const entries = new Map<string, number>();
  let totalUsd = 0;
  let anySeries = false;
  for (const sample of byAgent.data?.result ?? []) {
    const cost = finite(sample.value?.[1]);
    if (cost === undefined) {
      continue;
    }
    anySeries = true;
    totalUsd += cost;
    const { agent_namespace: namespace, agent } = sample.metric;
    if (!namespace || !agent || agent === 'unknown') {
      continue;
    }
    const agentId = encodeKagentAgentId(namespace, agent);
    entries.set(agentId, (entries.get(agentId) ?? 0) + cost);
  }

  // No priced call is not a cost of zero: an unpriced model records nothing,
  // so "$0.00" would be a claim this data cannot make.
  if (!anySeries) {
    return { status: 'unavailable', windowDays: days, reason: 'no-spend' };
  }

  return {
    status: 'actual',
    windowDays: days,
    totalUsd,
    byAgent: [...entries]
      .map(([agentId, costUsd]) => ({ agentId, costUsd }))
      .sort((a, b) => b.costUsd - a.costUsd),
    partial: countOf(unlabelled) > 0,
    evaluatedAt: now(),
  };
}
