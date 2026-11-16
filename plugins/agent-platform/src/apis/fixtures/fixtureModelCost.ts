import { AgentgatewayGenAiClientCostUsdTotal as Cost } from '@giantswarm/backstage-plugin-gs-common';
import {
  counterIncreaseOf,
  DAY,
  FIXTURE_PERSON_EMAIL,
  gatewaySeries,
  isUnreachableInstallation,
  type FixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import {
  encodeKagentAgentId,
  type ModelCostResponse,
} from '@giantswarm/backstage-plugin-agent-platform-common';

/** The gateway's `user` values that name nobody, as the backend reads them. */
const UNATTRIBUTED_USERS = ['', 'unknown'];

/**
 * The person's model cost on one installation over the last `days` days, as
 * agent-platform-backend's `readModelCost` reads it from Mimir, here from the
 * fixture gateway series the fixture Mimir answers from: the growth of the
 * person's cost series by agent, `partial` when some calls in the window name
 * no one. kagent on an unreachable installation cannot say who the person is.
 */
export function fixtureModelCost(
  data: FixtureDataSet,
  installation: string,
  days: number,
  now: number,
): ModelCostResponse {
  if (isUnreachableInstallation(data, installation)) {
    return {
      status: 'unavailable',
      windowDays: days,
      reason: 'identity-unreadable',
    };
  }
  const start = now - days * DAY;
  const costSeries = gatewaySeries(data, installation).filter(
    series =>
      series.labels.__name__ === Cost.name &&
      series.points[0] !== undefined &&
      series.points[0][0] <= now,
  );

  const byAgent = new Map<string, number>();
  let totalUsd = 0;
  for (const series of costSeries) {
    if (series.labels.user !== FIXTURE_PERSON_EMAIL) {
      continue;
    }
    const cost = counterIncreaseOf(series, start, now) ?? 0;
    if (cost <= 0) {
      continue;
    }
    totalUsd += cost;
    const agentId = encodeKagentAgentId(
      series.labels.agent_namespace,
      series.labels.agent,
    );
    byAgent.set(agentId, (byAgent.get(agentId) ?? 0) + cost);
  }

  const unattributed = (user: string | undefined) =>
    UNATTRIBUTED_USERS.includes(user ?? '');
  if (totalUsd <= 0) {
    const attributed = costSeries.some(s => !unattributed(s.labels.user));
    return {
      status: 'unavailable',
      windowDays: days,
      reason: attributed ? 'no-spend' : 'not-recorded',
    };
  }
  return {
    status: 'actual',
    windowDays: days,
    totalUsd,
    byAgent: [...byAgent]
      .map(([agentId, costUsd]) => ({ agentId, costUsd }))
      .sort((a, b) => b.costUsd - a.costUsd),
    partial: costSeries.some(s => unattributed(s.labels.user)),
    evaluatedAt: now,
  };
}
