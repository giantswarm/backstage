import type { LlmUsage } from '../../lib/llmUsage';
import type { AgentRow } from '../AgentsDataProvider';
import {
  agentsUsingModel,
  describeContextWindow,
  isGatewayModelOf,
  modelUsageSlice,
} from './modelUsage';

describe('isGatewayModelOf', () => {
  it('matches the same model, whatever the case', () => {
    expect(isGatewayModelOf('claude-sonnet-4-5', 'claude-sonnet-4-5')).toBe(
      true,
    );
    expect(isGatewayModelOf('Qwen3-8B', 'qwen3-8b')).toBe(true);
  });

  it('matches a dated snapshot of the configured alias', () => {
    expect(
      isGatewayModelOf('claude-sonnet-4-5', 'claude-sonnet-4-5-20250929'),
    ).toBe(true);
    expect(isGatewayModelOf('gpt-4o', 'gpt-4o-2024-08-06')).toBe(true);
  });

  it('does not take another model sharing the prefix for a snapshot', () => {
    expect(isGatewayModelOf('gpt-4o', 'gpt-4o-mini')).toBe(false);
    expect(isGatewayModelOf('gpt-4o', 'gpt-4o-mini-2024-07-18')).toBe(false);
    expect(isGatewayModelOf('claude-opus-5', 'claude-opus-5-1')).toBe(false);
  });

  it('matches nothing without a model on either side', () => {
    expect(isGatewayModelOf(undefined, 'gpt-4o')).toBe(false);
    expect(isGatewayModelOf('gpt-4o', '')).toBe(false);
  });
});

function usage(overrides: Partial<LlmUsage>): LlmUsage {
  return {
    windowDays: 30,
    totals: {
      costUsd: 0,
      tokens: 0,
      calls: 0,
      agents: 0,
      models: 0,
      usdPerMillion: undefined,
      avgTokensPerCall: undefined,
      cacheReadSharePct: undefined,
    },
    tokenTypes: {
      input: 0,
      output: 0,
      inputCacheRead: 0,
      inputCacheWrite: 0,
      other: 0,
    },
    byAgent: [],
    byModel: [],
    byAgentModel: [],
    costPerDay: { rows: [], series: [] },
    tokensPerDay: { rows: [], series: [] },
    reliability: {
      totalRequests: 0,
      errorRequests: 0,
      errorRatePct: undefined,
      rateLimited: 0,
      p50Seconds: undefined,
      p95Seconds: undefined,
      outputTokensPerSecond: undefined,
    },
    unpricedModels: [],
    rates: {} as LlmUsage['rates'],
    ...overrides,
  };
}

const modelRow = (
  model: string,
  costUsd: number | undefined,
  tokens: number,
  calls: number,
) => ({
  id: model,
  model,
  tokens,
  calls,
  costUsd,
  usdPerMillion: undefined,
  avgTokensPerCall: undefined,
  sharePct: undefined,
});

describe('modelUsageSlice', () => {
  const gatewayUsage = usage({
    byModel: [
      modelRow('claude-sonnet-4-5-20250929', 40, 2_000_000, 800),
      modelRow('claude-sonnet-4-5', 2, 100_000, 20),
      modelRow('gpt-4o', 9, 500_000, 300),
    ],
    byAgentModel: [
      {
        id: 'a',
        namespace: 'kagent',
        agent: 'support-triage',
        model: 'claude-sonnet-4-5-20250929',
        tokens: 1_500_000,
        calls: 600,
        costUsd: 30,
      },
      {
        id: 'b',
        namespace: 'kagent',
        agent: 'support-triage',
        model: 'claude-sonnet-4-5',
        tokens: 100_000,
        calls: 20,
        costUsd: 2,
      },
      {
        id: 'c',
        namespace: 'kagent',
        agent: 'researcher',
        model: 'gpt-4o',
        tokens: 500_000,
        calls: 300,
        costUsd: 9,
      },
    ],
    costPerDay: {
      series: ['claude-sonnet-4-5-20250929', 'gpt-4o', 'claude-sonnet-4-5'],
      rows: [
        {
          day: '2026-10-08',
          'claude-sonnet-4-5-20250929': 3,
          'gpt-4o': 1,
          'claude-sonnet-4-5': 0.5,
        },
        { day: '2026-10-09', 'claude-sonnet-4-5-20250929': 2, 'gpt-4o': 4 },
      ],
    },
  });

  it('totals every gateway row of the model, snapshots included', () => {
    const slice = modelUsageSlice(gatewayUsage, 'claude-sonnet-4-5', 'Sonnet');

    expect(slice.costUsd).toBe(42);
    expect(slice.tokens).toBe(2_100_000);
    expect(slice.calls).toBe(820);
    expect(slice.gatewayModels).toEqual([
      'claude-sonnet-4-5-20250929',
      'claude-sonnet-4-5',
    ]);
  });

  it("folds the model's bars into one series named for people", () => {
    const slice = modelUsageSlice(gatewayUsage, 'claude-sonnet-4-5', 'Sonnet');

    expect(slice.costPerDay).toEqual({
      series: ['Sonnet'],
      rows: [
        { day: '2026-10-08', Sonnet: 3.5 },
        { day: '2026-10-09', Sonnet: 2 },
      ],
    });
  });

  it('splits the model by agent', () => {
    const slice = modelUsageSlice(gatewayUsage, 'claude-sonnet-4-5', 'Sonnet');

    expect(slice.byAgent.get('kagent/support-triage')).toEqual({
      tokens: 1_600_000,
      calls: 620,
      costUsd: 32,
    });
    expect(slice.byAgent.has('kagent/researcher')).toBe(false);
  });

  it('keeps an unpriced model unpriced rather than free', () => {
    const slice = modelUsageSlice(
      usage({ byModel: [modelRow('qwen3', undefined, 1000, 4)] }),
      'qwen3',
      'Qwen',
    );

    expect(slice.costUsd).toBeUndefined();
    expect(slice.calls).toBe(4);
  });

  it('has no series and no calls for a model the gateway never saw', () => {
    const slice = modelUsageSlice(gatewayUsage, 'gemini-2.5-pro', 'Gemini');

    expect(slice.calls).toBe(0);
    expect(slice.costUsd).toBeUndefined();
    expect(slice.costPerDay).toEqual({ rows: [], series: [] });
  });
});

describe('agentsUsingModel', () => {
  const agent = (name: string, modelConfigId?: string) =>
    ({
      id: `inst-1/kagent/${name}`,
      name,
      ...(modelConfigId ? { modelConfigId } : {}),
    }) as AgentRow;

  it('lists the agents whose spec names the ModelConfig, by name', () => {
    const rows = [
      agent('Zed', 'inst-1/kagent/sonnet'),
      agent('Alpha', 'inst-1/kagent/sonnet'),
      agent('Other', 'inst-1/kagent/gpt'),
      agent('None'),
      agent('Elsewhere', 'inst-2/kagent/sonnet'),
    ];

    expect(
      agentsUsingModel(rows, 'inst-1/kagent/sonnet').map(row => row.name),
    ).toEqual(['Alpha', 'Zed']);
  });
});

describe('describeContextWindow', () => {
  it('words the window in thousands or millions of tokens', () => {
    expect(describeContextWindow(200_000)).toBe('200k tokens');
    expect(describeContextWindow(128_000)).toBe('128k tokens');
    expect(describeContextWindow(1_000_000)).toBe('1M tokens');
    expect(describeContextWindow(1_048_576)).toBe('1M tokens');
    expect(describeContextWindow(512)).toBe('512 tokens');
  });
});
