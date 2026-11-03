import { mockServices } from '@backstage/backend-test-utils';
import {
  AuthenticationError,
  NotFoundError,
  ServiceUnavailableError,
} from '@backstage/errors';
import type { MimirQueryResponse } from '@giantswarm/backstage-plugin-gs-node';
import {
  callerEmail,
  MimirQuerier,
  modelCostQueries,
  readModelCost,
} from './modelCost';

function vector(
  samples: Array<{ metric?: Record<string, string>; value: string }>,
): MimirQueryResponse {
  return {
    status: 'success',
    data: {
      resultType: 'vector',
      result: samples.map(({ metric = {}, value }) => ({
        metric,
        value: [1_700_000_000, value],
      })),
    },
  };
}

/**
 * A Mimir that answers each of the three queries by what it asks for, and
 * records every query it was sent.
 */
function fakeMimir(answers: {
  byAgent?: MimirQueryResponse;
  attributed?: string;
  unattributed?: string;
}) {
  const query = jest.fn(async ({ query: promql }: { query: string }) => {
    if (promql.startsWith('sum by (agent_namespace, agent)')) {
      return answers.byAgent ?? vector([]);
    }
    if (promql.includes('{user!~"|unknown"}')) {
      return answers.attributed === undefined
        ? vector([])
        : vector([{ value: answers.attributed }]);
    }
    return answers.unattributed === undefined
      ? vector([])
      : vector([{ value: answers.unattributed }]);
  });
  return { query } as unknown as MimirQuerier & { query: jest.Mock };
}

const identityOf = (claims: unknown) => ({
  getMe: jest.fn().mockResolvedValue(claims),
});

const read = (overrides: Partial<Parameters<typeof readModelCost>[0]> = {}) =>
  readModelCost({
    identity: identityOf({ sub: 'me@example.com' }),
    mimir: fakeMimir({}),
    installation: 'gazelle',
    userToken: 'my-token',
    days: 30,
    logger: mockServices.logger.mock(),
    now: () => 1_700_000_000_000,
    ...overrides,
  });

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
    const { byAgent } = modelCostQueries('me@example.com', 7);
    expect(byAgent).toBe(
      'sum by (agent_namespace, agent) (increase(agentgateway_gen_ai_client_cost_usd_total{user="me@example.com"}[7d]) or label_replace(min_over_time(agentgateway_gen_ai_client_cost_usd_total{user="me@example.com"}[7d]) unless last_over_time(agentgateway_gen_ai_client_cost_usd_total{user="me@example.com"}[1h] offset 7d), "first_sample", "true", "__name__", ".*"))',
    );
  });

  it('escapes the identity, so a claim cannot widen the matcher', () => {
    const { byAgent } = modelCostQueries('x"} or vector(1) #', 7);
    expect(byAgent).toContain('{user="x\\"} or vector(1) #"}');
  });
});

describe('readModelCost', () => {
  it('asks kagent who the caller is with their own token, and queries Mimir as them', async () => {
    const identity = identityOf({ sub: 'me@example.com' });
    const mimir = fakeMimir({ attributed: '3' });
    await read({ identity, mimir });

    expect(identity.getMe).toHaveBeenCalledWith({ userToken: 'my-token' });
    for (const [args] of mimir.query.mock.calls) {
      expect(args).toMatchObject({
        installationName: 'gazelle',
        oidcToken: 'my-token',
      });
    }
    const personal = mimir.query.mock.calls
      .map(([args]) => args.query as string)
      .filter(query => /user="[^"]/.test(query));
    expect(personal.length).toBeGreaterThan(0);
    for (const query of personal) {
      expect(query).toContain('user="me@example.com"');
    }
  });

  it('totals every priced call and splits it by agent in kagent’s encoding', async () => {
    const mimir = fakeMimir({
      attributed: '5',
      unattributed: '0',
      byAgent: vector([
        {
          metric: { agent_namespace: 'org-acme', agent: 'sre-agent' },
          value: '1.5',
        },
        { metric: { agent_namespace: 'kagent', agent: 'helper' }, value: '2' },
        // A call from outside any pod: in the total, in no row.
        {
          metric: { agent_namespace: 'unknown', agent: 'unknown' },
          value: '0.5',
        },
        { metric: { agent_namespace: 'kagent', agent: 'odd' }, value: 'NaN' },
      ]),
    });

    await expect(read({ mimir })).resolves.toEqual({
      status: 'actual',
      windowDays: 30,
      totalUsd: 4,
      byAgent: [
        { agentId: 'kagent__NS__helper', costUsd: 2 },
        { agentId: 'org_acme__NS__sre_agent', costUsd: 1.5 },
      ],
      partial: false,
      evaluatedAt: 1_700_000_000_000,
    });
  });

  it('flags a window that holds series recorded without a user', async () => {
    const mimir = fakeMimir({
      attributed: '5',
      unattributed: '2',
      byAgent: vector([
        { metric: { agent_namespace: 'kagent', agent: 'a' }, value: '1' },
      ]),
    });
    await expect(read({ mimir })).resolves.toMatchObject({
      status: 'actual',
      partial: true,
    });
  });

  it('runs no query when kagent names nobody', async () => {
    const mimir = fakeMimir({});
    await expect(
      read({ identity: identityOf({ sub: 'admin@kagent.dev' }), mimir }),
    ).resolves.toEqual({
      status: 'unavailable',
      windowDays: 30,
      reason: 'no-identity',
    });
    expect(mimir.query).not.toHaveBeenCalled();
  });

  it('says so when no cost series names a person — unknown counts as no one', async () => {
    // A gateway that resolves no identity labels every call `unknown`: the
    // person's query finds nothing, and that is "not recorded", not "you
    // spent nothing".
    const mimir = fakeMimir({ unattributed: '4' });
    await expect(read({ mimir })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'not-recorded',
    });
    expect(modelCostQueries('me@example.com', 30).attributed).toContain(
      '{user!~"|unknown"}',
    );
    expect(modelCostQueries('me@example.com', 30).unattributed).toContain(
      '{user=~"|unknown"}',
    );
  });

  it('reports no spend rather than $0 when none of the person’s calls was priced', async () => {
    const mimir = fakeMimir({ attributed: '4' });
    await expect(read({ mimir })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'no-spend',
    });
  });

  it('treats series that did not grow in the window as no spend, not $0.00', async () => {
    const mimir = fakeMimir({
      attributed: '4',
      byAgent: vector([
        { metric: { agent_namespace: 'kagent', agent: 'a' }, value: '0' },
      ]),
    });
    await expect(read({ mimir })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'no-spend',
    });
  });

  it('asks for the installation-wide attribution count only when the person has no series', async () => {
    const mimir = fakeMimir({
      byAgent: vector([
        { metric: { agent_namespace: 'kagent', agent: 'a' }, value: '1' },
      ]),
    });
    await read({ mimir });

    const queries = mimir.query.mock.calls.map(([args]) => args.query);
    expect(queries).toHaveLength(2);
    expect(queries.join('\n')).not.toContain('user!~');
  });

  it('keeps the query, which names the person, out of the debug log', async () => {
    const mimir = fakeMimir({ attributed: '1' });
    await read({ mimir });

    for (const [args] of mimir.query.mock.calls) {
      expect(args.redactQuery).toBe(true);
    }
  });

  it('answers unreadable for a Mimir that is down, and logs it below warn', async () => {
    const logger = mockServices.logger.mock();
    const mimir = {
      query: jest.fn().mockRejectedValue(new ServiceUnavailableError('down')),
    };
    await expect(read({ mimir, logger })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'unreadable',
    });
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('answers no-mimir, not an error, where the installation has none', async () => {
    for (const mimir of [
      { query: jest.fn().mockRejectedValue(new NotFoundError('no Mimir')) },
      undefined,
    ]) {
      await expect(read({ mimir })).resolves.toMatchObject({
        status: 'unavailable',
        reason: 'no-mimir',
      });
    }
  });

  it('answers identity-unreadable, not a 5xx, when kagent is down', async () => {
    const logger = mockServices.logger.mock();
    const mimir = fakeMimir({});
    const identity = {
      getMe: jest.fn().mockRejectedValue(new ServiceUnavailableError('down')),
    };
    await expect(read({ identity, mimir, logger })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'identity-unreadable',
    });
    expect(mimir.query).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('lets a refused token through from kagent or Mimir, so the person can sign in again', async () => {
    const refused = new AuthenticationError('token refused');
    await expect(
      read({ identity: { getMe: jest.fn().mockRejectedValue(refused) } }),
    ).rejects.toBe(refused);
    await expect(
      read({ mimir: { query: jest.fn().mockRejectedValue(refused) } }),
    ).rejects.toBe(refused);
  });
});
