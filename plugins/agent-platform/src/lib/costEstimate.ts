/**
 * Turning observed spend into a per-token rate, and a rate into an estimate.
 *
 * The gateway prices whole model calls, and its metrics carry no session
 * label — so a session's cost cannot be read, only estimated: take the
 * $/token the installation actually achieved over a window, and apply it to
 * the token counts kagent recorded for that session.
 *
 * **These are estimates, and every caller must say so.** Two things make them
 * approximate: the rate is an average over a window, so it moves when the
 * model mix moves; and kagent's token counts and the gateway's are two
 * separate measurements of the same calls, which need not partition cached
 * input the same way.
 */

/**
 * Token types whose spend is input spend. Their *tokens* are added up only
 * where `input` leaves the cache types out: see {@link CACHE_TOKEN_TYPES}.
 */
const INPUT_TOKEN_TYPES = ['input', 'input_cache_read', 'input_cache_write'];
const OUTPUT_TOKEN_TYPES = ['output'];

/**
 * Token types the gateway counts **inside** `input` as well as on their own.
 *
 * Since v1.5.0 (agentgateway#2880), agentgateway normalises every provider's
 * input count to include the tokens read from and written to cache
 * (`CacheTokenConvention::include_cache_tokens`), then records the cache
 * counts again under these types. So `input` is every input token, and adding
 * these to it counts cached input twice. On `gazelle` (2026-11-03) the two
 * cache types summed to `input` to within 0.01% for every model, and adding
 * them halved the rate (giantswarm/giantswarm#38457).
 *
 * An older gateway left them out of `input` — Anthropic's own convention —
 * and so does a window that reaches back before an upgrade, in part. The
 * totals say which: see {@link inputIncludesCache}.
 */
const CACHE_TOKEN_TYPES = ['input_cache_read', 'input_cache_write'];

/**
 * How far the cache types may exceed `input` and still count as inside it.
 * `increase()` extrapolates each series on its own, so totals that hold the
 * same calls drift a little apart: on `gazelle` every agent and model scope
 * had the cache types at 99.8–99.998% of `input`. Under the old convention a
 * cache-heavy mix has them at many times `input`, far from this line.
 */
const CACHE_IN_INPUT_TOLERANCE = 1.01;

export type TokenRates = {
  /**
   * USD per input token, the spend of `input`, `input_cache_read` and
   * `input_cache_write` over the input tokens, each counted once — because
   * the counts we apply it to (kagent's `promptTokenCount`) are one undivided
   * number.
   *
   * Only derivable when the cost metric carries `gen_ai_token_type`.
   */
  input?: number;
  /** USD per output token. Same condition as {@link TokenRates.input}. */
  output?: number;
  /**
   * USD per token across every type. Present whenever any spend was priced at
   * all, so this is the fallback that keeps an estimate available.
   */
  blended?: number;
};

/**
 * A rate, or nothing.
 *
 * Zero cost yields **no rate rather than a rate of zero**: the gateway records
 * nothing for a model missing from its price catalogue, so zero spend and
 * unpriced spend are indistinguishable here — and a zero rate would render as
 * a confident `$0.00`. `undefined` renders as `—`, which is the truth.
 */
function ratio(cost: number, tokens: number): number | undefined {
  if (!Number.isFinite(cost) || !Number.isFinite(tokens)) {
    return undefined;
  }
  if (tokens <= 0 || cost <= 0) {
    return undefined;
  }
  return cost / tokens;
}

function sumTypes(totals: Record<string, number>, types: string[]): number {
  return types.reduce((acc, type) => acc + (totals[type] ?? 0), 0);
}

function sumAll(totals: Record<string, number>): number {
  return Object.values(totals).reduce((acc, value) => acc + (value ?? 0), 0);
}

/**
 * Whether the totals count the cache types inside `input`, as agentgateway
 * v1.5.0 and later do. They cannot exceed `input` when they are part of it,
 * so cache types well above `input` are the old convention, where `input` is
 * fresh input alone.
 *
 * A window straddling the upgrade holds both conventions, and no reading of
 * the totals is right for both parts: the rate can be off either way until
 * the window has rolled past the upgrade.
 */
function inputIncludesCache(totals: Record<string, number>): boolean {
  return (
    sumTypes(totals, CACHE_TOKEN_TYPES) <=
    (totals.input ?? 0) * CACHE_IN_INPUT_TOLERANCE
  );
}

/** Every token the totals hold, each once. */
export function sumDistinctTokens(totals: Record<string, number>): number {
  return inputIncludesCache(totals)
    ? sumAll(totals) - sumTypes(totals, CACHE_TOKEN_TYPES)
    : sumAll(totals);
}

/** Every input token the totals hold, each once. */
export function sumInputTokens(totals: Record<string, number>): number {
  return inputIncludesCache(totals)
    ? (totals.input ?? 0)
    : sumTypes(totals, INPUT_TOKEN_TYPES);
}

/**
 * Derive $/token from cost and token totals broken down by
 * `gen_ai_token_type`.
 *
 * Whether the *cost* metric carries that label is a property of the gateway
 * build, not something to assume: when it does not, `costByType` arrives as a
 * single unlabelled bucket, both per-type ratios come out `undefined`, and
 * only `blended` is set. {@link estimateCost} handles either shape, so nothing
 * downstream has to branch.
 *
 * **The blended branch is the live one.** Checked against the gateway on
 * `gazelle` (2026-09-10): `agentgateway_gen_ai_client_token_usage` carries
 * `gen_ai_token_type` with all four values, and
 * `agentgateway_gen_ai_client_cost_usd_total` carries **no** `gen_ai_token_type`
 * at all — so today every estimate is a blend.
 *
 * **A blend is the window's mix, not the session's.** Most of the window's
 * input is cache reads, which a provider prices at a fraction of fresh input,
 * so the blend undercharges a session that reads little from cache — a short
 * one most of all: a one-turn session on `gazelle` came out at a fifth of its
 * bill (giantswarm/giantswarm#38457). Telling them apart takes the spend by
 * token type, which the gateway does not record. The per-type branch is kept
 * because it costs nothing and is where a gateway release that adds the label
 * would land; do not delete it as dead code without re-checking.
 */
export function deriveTokenRates(
  costByType: Record<string, number>,
  tokensByType: Record<string, number>,
): TokenRates {
  const totalCost = sumAll(costByType);
  const totalTokens = sumDistinctTokens(tokensByType);

  return {
    input: ratio(
      sumTypes(costByType, INPUT_TOKEN_TYPES),
      sumInputTokens(tokensByType),
    ),
    output: ratio(
      sumTypes(costByType, OUTPUT_TOKEN_TYPES),
      sumTypes(tokensByType, OUTPUT_TOKEN_TYPES),
    ),
    blended: ratio(totalCost, totalTokens),
  };
}

/**
 * A token count as the estimate prices it: a negative or non-finite count is
 * none. {@link estimateCost} and the basis line that names its counts
 * (`describeCostBasis`) both go through this, so they cannot disagree.
 */
export function pricedTokenCount(tokens: number): number {
  return Number.isFinite(tokens) ? Math.max(tokens, 0) : 0;
}

/**
 * Estimated USD for a pair of token counts.
 *
 * Prefers the per-type rates, which price input and output separately the way
 * a provider does; falls back to the blended rate. Returns `undefined` when no
 * rate could be derived — render that as `—`, never as `$0.00`.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  rates: TokenRates | undefined,
): number | undefined {
  if (!rates) {
    return undefined;
  }

  const input = pricedTokenCount(inputTokens);
  const output = pricedTokenCount(outputTokens);

  // Both halves or neither: pricing input at the real input rate and output at
  // a blend of the two would be worse than blending both, because output costs
  // several times input and the blend is dominated by input volume.
  if (rates.input !== undefined && rates.output !== undefined) {
    return input * rates.input + output * rates.output;
  }

  if (rates.blended !== undefined) {
    return (input + output) * rates.blended;
  }

  return undefined;
}
