/**
 * Turning observed spend into a per-token rate, and a rate into an estimate.
 *
 * The gateway prices whole model calls, and its metrics carry no session and
 * no user label — so a session's cost cannot be read, only estimated: take the
 * $/token the installation actually achieved over a window, and apply it to
 * the token counts kagent recorded for that session.
 *
 * **These are estimates, and every caller must say so.** Two things make them
 * approximate: the rate is an average over a window, so it moves when the
 * model mix moves; and kagent's token counts and the gateway's are two
 * separate measurements of the same calls, which need not partition cached
 * input the same way.
 */

/** Token types the gateway bills as input. `input` excludes cache traffic. */
const INPUT_TOKEN_TYPES = ['input', 'input_cache_read', 'input_cache_write'];
const OUTPUT_TOKEN_TYPES = ['output'];

export type TokenRates = {
  /**
   * USD per input token, blended across `input`, `input_cache_read` and
   * `input_cache_write` — because the counts we apply it to (kagent's
   * `promptTokenCount`) are one undivided number.
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
 * at all — so today every estimate is a blend. The per-type branch is kept
 * because it costs nothing and is where a gateway release that adds the label
 * would land; do not delete it as dead code without re-checking.
 */
export function deriveTokenRates(
  costByType: Record<string, number>,
  tokensByType: Record<string, number>,
): TokenRates {
  const totalCost = sumAll(costByType);
  const totalTokens = sumAll(tokensByType);

  return {
    input: ratio(
      sumTypes(costByType, INPUT_TOKEN_TYPES),
      sumTypes(tokensByType, INPUT_TOKEN_TYPES),
    ),
    output: ratio(
      sumTypes(costByType, OUTPUT_TOKEN_TYPES),
      sumTypes(tokensByType, OUTPUT_TOKEN_TYPES),
    ),
    blended: ratio(totalCost, totalTokens),
  };
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

  const input = Number.isFinite(inputTokens) ? Math.max(inputTokens, 0) : 0;
  const output = Number.isFinite(outputTokens) ? Math.max(outputTokens, 0) : 0;

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
