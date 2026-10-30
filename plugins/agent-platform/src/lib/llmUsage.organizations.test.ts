import type { MimirMetricSample } from '@giantswarm/backstage-plugin-gs';
import type { AgentRow } from '../components/AgentsDataProvider';
import { buildLlmUsage, reduceByOrganization } from './llmUsage';

function sample(
  metric: Record<string, string>,
  value: string,
): MimirMetricSample {
  return { metric, value: [1757462400, value] };
}

const alpha = { agent_namespace: 'org-alpha', agent: 'planner' };
const alphaToo = { agent_namespace: 'org-alpha', agent: 'reviewer' };
const platform = { agent_namespace: 'kagent', agent: 'sre-agent' };
const elsewhere = { agent_namespace: 'team-x', agent: 'bot' };
const unknown = { agent_namespace: 'unknown', agent: 'unknown' };

const options = { unknownLabel: 'Unattributed' };

describe('reduceByOrganization', () => {
  it('rolls every agent of a namespace into one row, named as the Agents list names it', () => {
    const rows = reduceByOrganization({
      ...options,
      cost: [
        sample({ ...alpha, gen_ai_token_type: 'input' }, '4'),
        sample({ ...alpha, gen_ai_token_type: 'output' }, '2'),
        sample({ ...alphaToo, gen_ai_token_type: 'input' }, '1'),
        sample({ ...platform, gen_ai_token_type: 'input' }, '2'),
        sample({ ...elsewhere, gen_ai_token_type: 'input' }, '1'),
      ],
      tokens: [
        sample(alpha, '700000'),
        sample(alphaToo, '100000'),
        sample(platform, '150000'),
        sample(elsewhere, '50000'),
      ],
      calls: [
        sample(alpha, '12'),
        sample(alphaToo, '3'),
        sample(platform, '5'),
        sample(elsewhere, '1'),
      ],
    });

    expect(rows).toEqual([
      expect.objectContaining({
        id: 'org-alpha',
        namespace: 'org-alpha',
        kind: 'organization',
        label: 'alpha',
        description: 'org-alpha',
        agents: 2,
        tokens: 800_000,
        calls: 15,
        costUsd: 7,
        sharePct: 70,
      }),
      expect.objectContaining({
        id: 'kagent',
        kind: 'platform',
        label: 'None',
        description: undefined,
        agents: 1,
        costUsd: 2,
        sharePct: 20,
      }),
      expect.objectContaining({
        id: 'team-x',
        kind: 'namespace',
        label: 'namespace team-x',
        description: undefined,
        agents: 1,
        costUsd: 1,
        sharePct: 10,
      }),
    ]);
  });

  it('pools traffic the gateway attributed to no caller under one unattributed row, whatever its namespace label', () => {
    const rows = reduceByOrganization({
      ...options,
      cost: [
        sample(unknown, '0.5'),
        // The agent is unknown though the pod's namespace was read: the
        // by-agent table calls that unattributed, so this table does too.
        sample({ agent_namespace: 'kagent', agent: 'unknown' }, '0.25'),
        sample({ agent: 'orphan' }, '0.25'),
        sample(platform, '1'),
      ],
      tokens: [sample(unknown, '1000'), sample(platform, '2000')],
      calls: [sample(unknown, '2'), sample(platform, '4')],
    });

    expect(rows.map(row => [row.label, row.kind, row.costUsd])).toEqual([
      // Equal spend: the platform's tokens rank it first.
      ['None', 'platform', 1],
      ['Unattributed', 'unattributed', 1],
    ]);
    const unattributed = rows.find(row => row.kind === 'unattributed')!;
    expect(unattributed.id).toBe('unattributed');
    expect(unattributed.namespace).toBe('');
    expect(unattributed.agents).toBe(0);
    expect(unattributed.tokens).toBe(1000);
    expect(unattributed.calls).toBe(2);
  });

  it('ranks by spend, then tokens, then label', () => {
    const rows = reduceByOrganization({
      ...options,
      cost: [sample(platform, '1'), sample(alpha, '1')],
      tokens: [
        sample(platform, '10'),
        sample(alpha, '20'),
        sample(elsewhere, '5'),
      ],
      calls: [],
    });

    expect(rows.map(row => row.label)).toEqual([
      'alpha',
      'None',
      'namespace team-x',
    ]);
  });

  it('gives no spend and no share to a namespace nothing was priced in', () => {
    const rows = reduceByOrganization({
      ...options,
      cost: [],
      tokens: [sample(alpha, '1000')],
      calls: [sample(alpha, '1')],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].costUsd).toBeUndefined();
    expect(rows[0].sharePct).toBeUndefined();
    expect(rows[0].tokens).toBe(1000);
  });

  it('skips a sample Prometheus answered as NaN', () => {
    const rows = reduceByOrganization({
      ...options,
      cost: [sample(alpha, 'NaN'), sample(alpha, '2')],
      tokens: [],
      calls: [],
    });

    expect(rows[0].costUsd).toBe(2);
  });

  it('is empty without data', () => {
    expect(
      reduceByOrganization({ ...options, cost: [], tokens: [], calls: [] }),
    ).toEqual([]);
  });
});

describe('buildLlmUsage', () => {
  it('carries the roll-up by organization beside the by-agent rows, from the same vectors', () => {
    const agents = [
      {
        id: 'gazelle/org-alpha/planner',
        installation: 'gazelle',
        namespace: 'org-alpha',
        name: 'Planner',
        technicalName: 'planner',
        description: '',
      } as AgentRow,
    ];
    const usage = buildLlmUsage({
      agents,
      installation: 'gazelle',
      hrefFor: () => undefined,
      unknownAgentLabel: 'Unattributed',
      unknownModelLabel: 'Unknown model',
      cost: [
        sample({ ...alpha, gen_ai_token_type: 'input' }, '3'),
        sample({ ...platform, gen_ai_token_type: 'input' }, '1'),
      ],
      tokens: [sample(alpha, '3000'), sample(platform, '1000')],
      calls: [sample(alpha, '3'), sample(platform, '1')],
      requestsByStatus: [],
      p50: [],
      p95: [],
      outputTokensPerSecond: [],
      unpricedLookups: [],
      costPerDay: [],
      tokensPerDay: [],
      days: ['2026-10-29', '2026-10-30'],
      today: '2026-10-30',
      costToday: [],
      tokensToday: [],
    });

    expect(usage.byOrganization.map(row => [row.label, row.costUsd])).toEqual([
      ['alpha', 3],
      ['None', 1],
    ]);
    // The same money, counted two ways.
    const byOrganization = usage.byOrganization.reduce(
      (sum, row) => sum + (row.costUsd ?? 0),
      0,
    );
    const byAgent = usage.byAgent.reduce(
      (sum, row) => sum + (row.costUsd ?? 0),
      0,
    );
    expect(byOrganization).toBe(byAgent);
    expect(byOrganization).toBe(usage.totals.costUsd);
  });
});
