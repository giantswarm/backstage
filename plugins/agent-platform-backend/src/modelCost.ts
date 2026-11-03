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
 * The gateway's `user` values that name nobody: none at all (a series from
 * before the label) and `unknown` (no identity resolved for the call). A series
 * carrying either is not attributable to a person.
 */
const UNATTRIBUTED_USERS = '|unknown';

/**
 * The PromQL behind the person's cost. Built here, from the identity kagent
 * vouched for, and never from the request — the value is escaped, so even an
 * odd claim cannot change the query's shape.
 *
 * - `byAgent`: the person's spend per calling agent (`agent_namespace`,
 *   `agent`: the pod's namespace and ServiceAccount, `unknown` when the
 *   caller matched no pod). The total is its sum.
 * - `attributed` / `unattributed`: how many of the window's cost series name
 *   a person, and how many do not. Counts of series, no one's figures, and
 *   installation-wide on purpose — they describe the gateway, not a person.
 *   Each scans every cost series over the window, so `attributed` is only
 *   asked when `byAgent` found nothing: any series of the person's implies it.
 */
export function modelCostQueries(user: string, days: number) {
  const window = `${days}d`;
  const mine = `${Cost.name}{user="${promqlString(user)}"}`;
  return {
    byAgent: `sum by (agent_namespace, agent) ${counterIncrease(mine, window)}`,
    attributed: `count(last_over_time(${Cost.name}{user!~"${UNATTRIBUTED_USERS}"}[${window}]))`,
    unattributed: `count(last_over_time(${Cost.name}{user=~"${UNATTRIBUTED_USERS}"}[${window}]))`,
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
 * outcome the page falls back to the estimate on — kagent or Mimir down, no
 * Mimir here at all — so none of them reaches a 5xx
 * (`MiddlewareFactory.error()` forwards those to Sentry), and the page can say
 * which it was. Only a token kagent or Mimir refused propagates (401): the
 * person can act on that by signing in again.
 */
export async function readModelCost(options: {
  identity: IdentityReader;
  mimir: MimirQuerier | undefined;
  installation: string;
  userToken: string;
  days: number;
  logger: LoggerService;
  now?: () => number;
}): Promise<ModelCostResponse> {
  const { identity, mimir, installation, userToken, days, logger } = options;
  const now = options.now ?? Date.now;
  const unavailable = (
    reason: Extract<ModelCostResponse, { status: 'unavailable' }>['reason'],
  ): ModelCostResponse => ({ status: 'unavailable', windowDays: days, reason });

  // Handled: the page shows the estimate and says why. No user in the
  // message, so one cause stays one line in the logs.
  const handled = (message: string, error: unknown) => {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    logger.info(message, { installation, error: String(error) });
  };

  let claims: unknown;
  try {
    claims = await identity.getMe({ userToken });
  } catch (error) {
    handled('Could not ask kagent who the caller is for the model cost', error);
    return unavailable('identity-unreadable');
  }
  const user = callerEmail(claims);
  if (!user) {
    return unavailable('no-identity');
  }
  if (!mimir) {
    return unavailable('no-mimir');
  }

  const queries = modelCostQueries(user, days);
  const run = (query: string) =>
    mimir.query({
      installationName: installation,
      query,
      oidcToken: userToken,
      // The query names the person; keep it out of the debug log.
      redactQuery: true,
    });

  let byAgent: MimirQueryResponse;
  let unattributed: MimirQueryResponse;
  let attributed: MimirQueryResponse | undefined;
  try {
    [byAgent, unattributed] = await Promise.all([
      run(queries.byAgent),
      run(queries.unattributed),
    ]);
    if (!byAgent.data?.result?.length) {
      attributed = await run(queries.attributed);
    }
  } catch (error) {
    if (error instanceof NotFoundError) {
      // `mimirEnabled: false`, or no `baseDomain`: no Mimir to ask.
      return unavailable('no-mimir');
    }
    handled('Could not read the model cost from Mimir', error);
    return unavailable('unreadable');
  }

  if (attributed && countOf(attributed) === 0) {
    return unavailable('not-recorded');
  }

  const entries = new Map<string, number>();
  let totalUsd = 0;
  for (const sample of byAgent.data?.result ?? []) {
    const cost = finite(sample.value?.[1]);
    // A series that did not grow in the window is no spend in it. Counting it
    // would make a quiet window read $0.00 while the gateway pod still exports
    // the series, and fall back once a restart drops it.
    if (cost === undefined || cost <= 0) {
      continue;
    }
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
  if (totalUsd <= 0) {
    return unavailable('no-spend');
  }

  return {
    status: 'actual',
    windowDays: days,
    totalUsd,
    byAgent: [...entries]
      .map(([agentId, costUsd]) => ({ agentId, costUsd }))
      .sort((a, b) => b.costUsd - a.costUsd),
    partial: countOf(unattributed) > 0,
    evaluatedAt: now(),
  };
}
