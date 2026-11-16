// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- the fixture Mimir is the gs plugin's.
import type { MimirFixtureApi } from '@giantswarm/backstage-plugin-gs/fixtures';
import { AgentgatewayGenAiClientCostUsdTotal as Cost } from '@giantswarm/backstage-plugin-gs-common';
import {
  isUnreachableInstallation,
  type FixtureDataSet,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import {
  callerEmail,
  modelCostOf,
  modelCostQueries,
  needsAttributedCount,
  type ModelCostResponse,
} from '@giantswarm/backstage-plugin-agent-platform-common';
import { FIXTURE_USER } from './fixtureIdentity';

/**
 * The person's model cost on one installation over the last `days` days, as
 * agent-platform-backend's `readModelCost` reads it: kagent names the person
 * (the fixture user; kagent on an unreachable installation cannot be asked),
 * the backend's queries run through the fixture Mimir, and the shared
 * `modelCostOf` decides what their answers come to.
 */
export async function fixtureModelCost(options: {
  data: FixtureDataSet;
  mimir: Pick<MimirFixtureApi, 'query'>;
  installation: string;
  days: number;
  now: number;
}): Promise<ModelCostResponse> {
  const { data, mimir, installation, days, now } = options;
  if (isUnreachableInstallation(data, installation)) {
    return {
      status: 'unavailable',
      windowDays: days,
      reason: 'identity-unreadable',
    };
  }
  const user = callerEmail(FIXTURE_USER);
  if (!user) {
    return { status: 'unavailable', windowDays: days, reason: 'no-identity' };
  }
  const queries = modelCostQueries(Cost.name, user, days);
  const run = async (query: string) =>
    (
      await mimir.query({
        installationName: installation,
        query,
      })
    ).data.result;
  const [byAgent, unattributed] = await Promise.all([
    run(queries.byAgent),
    run(queries.unattributed),
  ]);
  const attributed = needsAttributedCount(byAgent)
    ? await run(queries.attributed)
    : undefined;
  return modelCostOf(
    { byAgent, unattributed, attributed },
    { days, evaluatedAt: now },
  );
}
