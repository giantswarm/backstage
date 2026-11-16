// eslint-disable-next-line @backstage/no-mixed-plugin-imports -- Mimir is the gs plugin's.
import { MimirFixtureApi } from '@giantswarm/backstage-plugin-gs/fixtures';
import {
  baseDataSet,
  FIXTURE_AGENT_MODEL,
  FIXTURE_PERSON_EMAIL,
} from '@giantswarm/backstage-plugin-gs-common/fixtures';
import { encodeKagentAgentId } from '@giantswarm/backstage-plugin-agent-platform-common';
import {
  byPersonQueriesFor,
  dailyRangeWindow,
  llmUsageQueriesFor,
  llmUsageRangeQueriesFor,
  organizationsSeenQueryFor,
  todayPartialQueries,
  todayPartialRange,
  tokenRateQueries,
} from '../../lib/llmUsageQueries';
import { agentManagerFixtureState } from './agentManagerFixtureState';
import { FIXTURE_USER } from './fixtureIdentity';
import { fixtureModelCost } from './fixtureModelCost';

const mimir = new MimirFixtureApi();
const token = { oidcToken: 'fixture' };

function query(installationName: string, promql: string) {
  return mimir.query({ installationName, query: promql, ...token });
}

function total(result: { value: [number, string] }[]): number {
  return result.reduce((sum, sample) => sum + Number(sample.value[1]), 0);
}

describe('the gateway metrics in fixture mode', () => {
  it('answers every query of the usage pages', async () => {
    const now = Date.now();
    const instant = [
      ...Object.values(llmUsageQueriesFor({ days: 30 })),
      ...Object.values(llmUsageQueriesFor({ days: 7, org: 'meadow-lupin' })),
      ...Object.values(
        llmUsageQueriesFor({ month: new Date(now).toISOString().slice(0, 7) }),
      ),
      ...Object.values(byPersonQueriesFor({ days: 30 })),
      ...Object.values(tokenRateQueries()),
      ...Object.values(todayPartialQueries(todayPartialRange(now))),
      organizationsSeenQueryFor({ days: 30 }),
    ].filter((q): q is string => q !== undefined);
    for (const promql of instant) {
      await expect(query('meadow', promql)).resolves.toMatchObject({
        status: 'success',
      });
    }
    const range = dailyRangeWindow(now, 30);
    for (const promql of Object.values(llmUsageRangeQueriesFor({}))) {
      const answer = await mimir.queryRange({
        installationName: 'meadow',
        query: promql,
        ...range,
        ...token,
      });
      expect(answer.data.result.length).toBeGreaterThan(0);
      expect(answer.data.result[0].values).toHaveLength(29);
    }
  });

  it('prices the agents with sessions, on their default model', async () => {
    const { cost } = llmUsageQueriesFor({ days: 30 });
    const answer = await query('fennel', cost);
    const agents = new Set(
      answer.data.result.map(
        s => `${s.metric.agent_namespace}/${s.metric.agent}`,
      ),
    );
    const withSessions = new Set(
      baseDataSet()
        .sessions.filter(s => s.installation === 'fennel')
        .map(s => `${s.agent.namespace}/${s.agent.name}`),
    );
    expect([...withSessions].every(agent => agents.has(agent))).toBe(true);
    expect(
      new Set(answer.data.result.map(s => s.metric.gen_ai_response_model)),
    ).toEqual(new Set([FIXTURE_AGENT_MODEL]));
    expect(total(answer.data.result)).toBeGreaterThan(0);

    // Each agent runs on its organization's default model, which agent-manager
    // lists.
    const state = agentManagerFixtureState();
    for (const agent of agents) {
      const [namespace] = agent.split('/');
      const models = state.listModelConfigs('fennel', namespace);
      expect(models.find(m => m.default)?.model).toBe(FIXTURE_AGENT_MODEL);
    }
  });

  it('gives the person the cost Usage · Cost shows them', async () => {
    expect(FIXTURE_USER.email).toBe(FIXTURE_PERSON_EMAIL);
    const now = Date.now();
    const cost = fixtureModelCost(baseDataSet(), 'fennel', 30, now);
    expect(cost).toMatchObject({ status: 'actual', partial: false });
    if (cost.status !== 'actual') {
      return;
    }
    const byPerson = await query(
      'fennel',
      byPersonQueriesFor({ days: 30 }).cost,
    );
    const person = byPerson.data.result.find(
      s => s.metric.user === FIXTURE_PERSON_EMAIL,
    );
    expect(Number(person?.value[1])).toBeCloseTo(cost.totalUsd, 6);

    const agentIds = new Set(
      baseDataSet()
        .sessions.filter(s => s.installation === 'fennel')
        .map(s => encodeKagentAgentId(s.agent.namespace, s.agent.name)),
    );
    expect(cost.byAgent.every(entry => agentIds.has(entry.agentId))).toBe(true);
  });

  it('says where some calls name no one, and where kagent cannot answer', () => {
    const now = Date.now();
    expect(fixtureModelCost(baseDataSet(), 'meadow', 30, now)).toMatchObject({
      status: 'actual',
      partial: true,
    });
    expect(fixtureModelCost(baseDataSet(), 'tarragon', 30, now)).toEqual({
      status: 'unavailable',
      windowDays: 30,
      reason: 'identity-unreadable',
    });
  });
});
