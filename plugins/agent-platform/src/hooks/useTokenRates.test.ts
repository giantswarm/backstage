import { renderHook } from '@testing-library/react';
import type { MimirMetricSample } from '@giantswarm/backstage-plugin-gs';
import { tokenRateQueries } from '../lib/llmUsageQueries';
import { useTokenRates } from './useTokenRates';

const responses = new Map<string, MimirMetricSample[]>();
let isAvailable: boolean | undefined = true;
let isLoading = false;

// Partial: the query templates in `llmUsageQueries` are built from this
// module's metric constants, so replacing it wholesale leaves them undefined.
jest.mock('@giantswarm/backstage-plugin-gs', () => ({
  ...jest.requireActual('@giantswarm/backstage-plugin-gs'),
  useMimirQuery: ({ query }: { query: string }) => ({
    data: {
      status: 'success',
      data: { resultType: 'vector', result: responses.get(query) ?? [] },
    },
    isLoading,
    error: null,
    isAvailable,
  }),
}));

function sample(
  metric: Record<string, string>,
  value: string,
): MimirMetricSample {
  return { metric, value: [1757462400, value] };
}

/** One agent/model pair's cost and tokens, in the shape both queries return. */
function traffic(
  agent: string,
  model: string,
  costUsd: number,
  tokens: number,
) {
  const labels = { agent_namespace: 'kagent', agent };
  return {
    cost: sample({ ...labels, gen_ai_response_model: model }, String(costUsd)),
    tokens: sample(
      { ...labels, gen_ai_response_model: model, gen_ai_token_type: 'input' },
      String(tokens),
    ),
  };
}

function given(...entries: ReturnType<typeof traffic>[]) {
  responses.set(
    tokenRateQueries.cost,
    entries.map(e => e.cost),
  );
  responses.set(
    tokenRateQueries.tokens,
    entries.map(e => e.tokens),
  );
}

// $3/1M on sonnet, $15/1M on the one agent that ran opus.
const SONNET = traffic('sre-agent', 'claude-sonnet-4-6', 3, 1_000_000);
const OPUS = traffic('grill-master', 'claude-opus-5', 15, 1_000_000);

beforeEach(() => {
  responses.clear();
  isAvailable = true;
  isLoading = false;
});

describe('useTokenRates', () => {
  it("prefers the model's own rate, whoever ran it", () => {
    given(SONNET, OPUS);

    const { result } = renderHook(() =>
      useTokenRates('gazelle', { model: 'claude-opus-5' }),
    );

    expect(result.current.tier).toBe('model');
    expect(result.current.rates.blended).toBeCloseTo(15 / 1_000_000);
  });

  it('gives no rate for a known model the gateway has never priced', () => {
    // The regression this exists for: a real session on claude-opus-5 was
    // priced at the installation's sonnet-derived blend, halving it. A wrong
    // model's price is not a degraded estimate, so the chain stops here rather
    // than falling through to the agent or the fleet.
    given(SONNET);

    const { result } = renderHook(() =>
      useTokenRates('gazelle', {
        namespace: 'kagent',
        name: 'grill-master',
        model: 'claude-opus-5',
      }),
    );

    expect(result.current.tier).toBe('none');
    expect(result.current.rates.blended).toBeUndefined();
  });

  it("falls back to the agent's blend only when the model is unknown", () => {
    given(SONNET, OPUS);

    const { result } = renderHook(() =>
      useTokenRates('gazelle', { namespace: 'kagent', name: 'grill-master' }),
    );

    expect(result.current.tier).toBe('agent');
    expect(result.current.rates.blended).toBeCloseTo(15 / 1_000_000);
  });

  it("falls back to the installation's blend when the agent has no traffic", () => {
    given(SONNET, OPUS);

    const { result } = renderHook(() =>
      useTokenRates('gazelle', { namespace: 'kagent', name: 'newcomer' }),
    );

    expect(result.current.tier).toBe('installation');
    // 18 USD over 2M tokens across both agents.
    expect(result.current.rates.blended).toBeCloseTo(18 / 2_000_000);
  });

  it('uses the installation blend with no scope at all', () => {
    given(SONNET, OPUS);

    const { result } = renderHook(() => useTokenRates('gazelle'));

    expect(result.current.tier).toBe('installation');
    expect(result.current.rates.blended).toBeCloseTo(18 / 2_000_000);
  });

  it('reports no tier when nothing anywhere was priced', () => {
    responses.set(tokenRateQueries.tokens, [SONNET.tokens]);

    const { result } = renderHook(() => useTokenRates('gazelle'));

    expect(result.current.tier).toBe('none');
    expect(result.current.rates.blended).toBeUndefined();
  });

  it('reports only a blended rate, since cost carries no token type', () => {
    // Verified against the gateway on gazelle: the token metric splits by
    // gen_ai_token_type, the cost metric does not.
    given(SONNET);

    const { result } = renderHook(() =>
      useTokenRates('gazelle', { model: 'claude-sonnet-4-6' }),
    );

    expect(result.current.rates.input).toBeUndefined();
    expect(result.current.rates.output).toBeUndefined();
    expect(result.current.rates.blended).toBeCloseTo(3 / 1_000_000);
  });

  it('echoes the model and window back for the caller’s copy', () => {
    given(SONNET);

    const { result } = renderHook(() =>
      useTokenRates('gazelle', { model: 'claude-sonnet-4-6' }),
    );

    expect(result.current.model).toBe('claude-sonnet-4-6');
    expect(result.current.window).toBe('7d');
  });

  it('reports loading, not "none", while the queries are in flight', () => {
    // The regression this exists for: before the answers land no tier derives
    // a rate, so the chain fell through to `none` — and the session tooltip
    // states that as a finding with a cause ("the gateway has never priced
    // this model"). Asserting a diagnosis nothing has measured yet.
    isLoading = true;
    given(SONNET);

    const { result } = renderHook(() =>
      useTokenRates('gazelle', { model: 'claude-sonnet-4-6' }),
    );

    expect(result.current.tier).toBe('loading');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.rates.blended).toBeUndefined();
  });

  it('resolves the real tier once they land', () => {
    given(SONNET);

    const { result } = renderHook(() =>
      useTokenRates('gazelle', { model: 'claude-sonnet-4-6' }),
    );

    expect(result.current.tier).toBe('model');
    expect(result.current.isLoading).toBe(false);
  });

  it('passes the Mimir availability through, so callers can say why', () => {
    isAvailable = false;

    const { result } = renderHook(() => useTokenRates('gazelle'));

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.tier).toBe('none');
  });
});
