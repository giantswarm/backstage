import { deriveTokenRates, estimateCost } from './costEstimate';

describe('deriveTokenRates', () => {
  it('derives separate input and output rates when cost splits by token type', () => {
    const rates = deriveTokenRates(
      { input: 3, input_cache_read: 1, output: 15 },
      // `input` holds the cache reads, as the gateway counts them.
      { input: 11_000_000, input_cache_read: 10_000_000, output: 1_000_000 },
    );

    // Input blends all three input types, because the count it is applied to
    // (kagent's promptTokenCount) is one undivided number.
    expect(rates.input).toBeCloseTo(4 / 11_000_000);
    expect(rates.output).toBeCloseTo(15 / 1_000_000);
    expect(rates.blended).toBeCloseTo(19 / 12_000_000);
  });

  it('falls back to a blended rate when cost carries no token type', () => {
    const rates = deriveTokenRates(
      { '': 19 },
      { input: 11_000_000, output: 1_000_000 },
    );

    expect(rates.input).toBeUndefined();
    expect(rates.output).toBeUndefined();
    expect(rates.blended).toBeCloseTo(19 / 12_000_000);
  });

  it('reads cache types a hair above input as inside it', () => {
    // `increase()` extrapolates each series on its own, so a count holding
    // the cache types can come out just below them.
    const rates = deriveTokenRates(
      { '': 19 },
      {
        input: 10_999_000,
        input_cache_read: 10_000_000,
        input_cache_write: 1_000_000,
        output: 1_000_000,
      },
    );

    expect(rates.blended).toBeCloseTo(19 / 11_999_000);
  });

  it('returns no rate at all when nothing was priced', () => {
    // Zero cost is what the gateway records for a model missing from its price
    // catalogue, so this must not become a rate of zero.
    expect(deriveTokenRates({}, { input: 5_000_000 })).toEqual({
      input: undefined,
      output: undefined,
      blended: undefined,
    });
    expect(
      deriveTokenRates({ input: 0, output: 0 }, { input: 5_000_000 }),
    ).toEqual({ input: undefined, output: undefined, blended: undefined });
  });

  it('does not divide by zero when there are no tokens', () => {
    const rates = deriveTokenRates({ input: 3 }, {});

    expect(rates.input).toBeUndefined();
    expect(rates.blended).toBeUndefined();
  });

  it('ignores non-finite totals rather than propagating NaN', () => {
    const rates = deriveTokenRates({ input: Number.NaN }, { input: 1_000_000 });

    expect(rates.input).toBeUndefined();
    expect(rates.blended).toBeUndefined();
  });
});

describe('the one-turn session of giantswarm/giantswarm#38457', () => {
  // claude-sonnet-5-5 on gazelle over the 7d rate window (2026-11-03): the
  // gateway's spend, and its tokens by `gen_ai_token_type`. `input` already
  // holds both cache types (4,145,979 + 391,832 = 4,537,811, the rest is
  // fresh input), because agentgateway normalises it to include them.
  const cost = { '': 2.7468 };
  const tokens = {
    input: 4_537_960,
    input_cache_read: 4_145_979,
    input_cache_write: 391_832,
    output: 92_499,
  };

  // The session: 9,800 input and 1,000 output tokens, which the provider
  // billed at $2 and $10 per million: $0.0296.
  const inputTokens = 9_800;
  const outputTokens = 1_000;

  it('divides the spend by the tokens the gateway counted, each once', () => {
    const rates = deriveTokenRates(cost, tokens);

    // $0.59 per million, not $0.30: adding the cache types to `input`
    // counted 4.5M cached tokens twice and halved the rate.
    expect(rates.blended).toBeCloseTo(2.7468 / (4_537_960 + 92_499), 12);
  });

  it('estimates the session at the window rate, not half of it', () => {
    const estimate = estimateCost(
      inputTokens,
      outputTokens,
      deriveTokenRates(cost, tokens),
    );

    // Still below the $0.0296 the provider billed: the window is 90% cache
    // reads, priced at a tenth of fresh input, and a one-turn session reads
    // none. The cost metric carries no token type, so the rate cannot tell
    // them apart — see `deriveTokenRates`.
    expect(estimate).toBeCloseTo(0.0064, 4);
  });
});

describe('estimateCost', () => {
  it('prices input and output separately when both rates exist', () => {
    const estimate = estimateCost(1_000_000, 100_000, {
      input: 3 / 1_000_000,
      output: 15 / 1_000_000,
    });

    expect(estimate).toBeCloseTo(3 + 1.5);
  });

  it('uses the blended rate when only it exists', () => {
    const estimate = estimateCost(900_000, 100_000, {
      blended: 2 / 1_000_000,
    });

    expect(estimate).toBeCloseTo(2);
  });

  it('prefers per-type rates over the blended one', () => {
    const estimate = estimateCost(1_000_000, 0, {
      input: 3 / 1_000_000,
      output: 15 / 1_000_000,
      blended: 99 / 1_000_000,
    });

    expect(estimate).toBeCloseTo(3);
  });

  it('blends when only one half of the per-type pair is derivable', () => {
    // An installation whose agents have produced input but no priced output
    // yet: pricing input exactly and output not at all would understate more
    // than blending both.
    const estimate = estimateCost(1_000_000, 100_000, {
      input: 3 / 1_000_000,
      blended: 2 / 1_000_000,
    });

    expect(estimate).toBeCloseTo(2.2);
  });

  it('returns undefined with no rates, so callers render an em dash', () => {
    expect(estimateCost(1_000, 100, {})).toBeUndefined();
    expect(estimateCost(1_000, 100, undefined)).toBeUndefined();
  });

  it('is zero for a session with no tokens, not undefined', () => {
    // The rate is known here; there is simply nothing to price. That is a real
    // $0.00, unlike an unpriced model.
    expect(estimateCost(0, 0, { blended: 2 / 1_000_000 })).toBe(0);
  });

  it('treats negative and non-finite counts as zero', () => {
    expect(estimateCost(-5, Number.NaN, { blended: 1 })).toBe(0);
  });
});
