import { callerEmail, modelCostOf, modelCostQueries } from './modelCostRead';

const COST = 'agentgateway_gen_ai_client_cost_usd_total';

describe('callerEmail', () => {
  it('prefers the email claim, then an email-shaped subject', () => {
    expect(callerEmail({ sub: 'opaque', email: 'me@example.com' })).toBe(
      'me@example.com',
    );
    expect(callerEmail({ sub: 'me@example.com' })).toBe('me@example.com');
  });

  it('names nobody for kagent’s shared user, an opaque subject or no claims', () => {
    expect(callerEmail({ sub: 'admin@kagent.dev' })).toBeUndefined();
    expect(callerEmail({ sub: 'CiQ0Zj' })).toBeUndefined();
    expect(callerEmail({})).toBeUndefined();
    expect(callerEmail(undefined)).toBeUndefined();
  });
});

describe('modelCostQueries', () => {
  it('filters the cost counter by the person and corrects for newborn series', () => {
    const { byAgent } = modelCostQueries(COST, 'me@example.com', 7);
    expect(byAgent).toBe(
      'sum by (agent_namespace, agent) (increase(agentgateway_gen_ai_client_cost_usd_total{user="me@example.com"}[7d]) or label_replace(min_over_time(agentgateway_gen_ai_client_cost_usd_total{user="me@example.com"}[7d]) unless last_over_time(agentgateway_gen_ai_client_cost_usd_total{user="me@example.com"}[1h] offset 7d), "first_sample", "true", "__name__", ".*"))',
    );
  });

  it('escapes the identity, so a claim cannot widen the matcher', () => {
    const { byAgent } = modelCostQueries(COST, 'x"} or vector(1) #', 7);
    expect(byAgent).toContain('{user="x\\"} or vector(1) #"}');
  });
});

describe('modelCostOf', () => {
  const at = (value: string, metric: Record<string, string> = {}) => ({
    metric,
    value: [1_700_000_000, value] as [number, string],
  });
  const options = { days: 30, evaluatedAt: 1 };

  it('totals every priced series and splits it by agent', () => {
    expect(
      modelCostOf(
        {
          byAgent: [
            at('2', { agent_namespace: 'ns', agent: 'a' }),
            at('1', { agent_namespace: 'ns', agent: 'unknown' }),
            at('0'),
          ],
          unattributed: [at('3')],
        },
        options,
      ),
    ).toEqual({
      status: 'actual',
      windowDays: 30,
      totalUsd: 3,
      byAgent: [{ agentId: 'ns__NS__a', costUsd: 2 }],
      partial: true,
      evaluatedAt: 1,
    });
  });

  it('tells no recorded person from no spend', () => {
    expect(
      modelCostOf({ byAgent: [], unattributed: [], attributed: [] }, options),
    ).toMatchObject({ reason: 'not-recorded' });
    expect(
      modelCostOf(
        { byAgent: [], unattributed: [], attributed: [at('4')] },
        options,
      ),
    ).toMatchObject({ reason: 'no-spend' });
  });
});
