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
  labelled?: string;
  unlabelled?: string;
}) {
  const query = jest.fn(async ({ query: promql }: { query: string }) => {
    if (promql.startsWith('sum by (agent_namespace, agent)')) {
      return answers.byAgent ?? vector([]);
    }
    if (promql.includes('{user!=""}')) {
      return answers.labelled === undefined
        ? vector([])
        : vector([{ value: answers.labelled }]);
    }
    return answers.unlabelled === undefined
      ? vector([])
      : vector([{ value: answers.unlabelled }]);
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
    const mimir = fakeMimir({ labelled: '3' });
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
      labelled: '5',
      unlabelled: '0',
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
      labelled: '5',
      unlabelled: '2',
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

  it('says so when the gateway records no user on any cost series', async () => {
    const mimir = fakeMimir({ unlabelled: '4' });
    await expect(read({ mimir })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'not-recorded',
    });
  });

  it('reports no spend rather than $0 when none of the person’s calls was priced', async () => {
    const mimir = fakeMimir({ labelled: '4' });
    await expect(read({ mimir })).resolves.toMatchObject({
      status: 'unavailable',
      reason: 'no-spend',
    });
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

  it.each([
    new NotFoundError('no Mimir here'),
    new AuthenticationError('token refused'),
  ])('lets %p through, so the page can tell it apart', async error => {
    const mimir = { query: jest.fn().mockRejectedValue(error) };
    await expect(read({ mimir })).rejects.toBe(error);
  });
});
