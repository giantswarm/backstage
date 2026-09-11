import { useMemo } from 'react';
import { useMimirQuery } from '@giantswarm/backstage-plugin-gs';
import type { MimirMetricSample } from '@giantswarm/backstage-plugin-gs';
import { deriveTokenRates, type TokenRates } from '../lib/costEstimate';
import { RATE_WINDOW, tokenRateQueries } from '../lib/llmUsageQueries';

/**
 * Which observation the rate came from — the whole point of the hook, because
 * the tiers are not equally trustworthy and the UI has to say which it used.
 */
export type TokenRateTier =
  /** This model's own observed $/token. The only tier that prices a model correctly. */
  | 'model'
  /** This agent's blend across whatever models it ran. */
  | 'agent'
  /** The installation's blend across every model. */
  | 'installation'
  /**
   * The queries have not landed yet, so no tier is known.
   *
   * Distinct from `none` on purpose. Both render `—`, but `none` is a
   * *finding* the UI states a cause for ("the gateway has never priced this
   * model"), and stating it before anything has been measured is a specific,
   * actionable, wrong claim.
   */
  | 'loading'
  /** No usable rate — render `—`, never a number. */
  | 'none';

export type TokenRatesView = {
  rates: TokenRates;
  tier: TokenRateTier;
  /** The model the rate was asked for, echoed back for the caller's copy. */
  model: string | undefined;
  isLoading: boolean;
  /** `false` when the installation is opted out of Mimir (`mimirEnabled: false`). */
  isAvailable: boolean | undefined;
  /** The window the rate was averaged over, for the copy that discloses it. */
  window: string;
};

export type TokenRateScope = {
  namespace?: string;
  name?: string;
  /**
   * The model as the provider names it (`claude-opus-5`), from the
   * ModelConfig's `spec.model` — not a display label, which would match no
   * `gen_ai_response_model` and so always fall through.
   */
  model?: string;
};

const NO_RATES: TokenRates = {};

/**
 * The observed $/token to price a session's tokens at, and which observation
 * it came from.
 *
 * Two Mimir queries — cost and tokens over {@link RATE_WINDOW}, grouped by
 * agent, model and token type — and everything else is arithmetic.
 *
 * **A known model that the gateway has not priced yields no rate at all**,
 * rather than falling back. That is the one rule here worth understanding,
 * because it is the opposite of what a fallback chain normally does, and it
 * comes from a measured failure: a real session on `claude-opus-5` was priced
 * at the installation's blend, which was derived entirely from
 * `claude-sonnet-4-6` traffic. Opus costs roughly twice Sonnet per token at a
 * typical input/output mix, so the strip read `$0.194` where the gateway's own
 * catalogue said `$0.40`. Substituting a different model's price is not a
 * degraded estimate, it is a wrong one — and an em dash a reader can act on
 * beats a number they cannot.
 *
 * So the chain is:
 *
 * 0. **`loading`** — the queries are in flight. No tier is known yet, and
 *    `none` must not stand in for that: it is a finding with a stated cause.
 * 1. **`model`** — the session's model has observed traffic. Use its rate.
 * 2. **`none`** — the model is known and has *no* observed traffic. Stop.
 * 3. **`agent`** — no model known, but this agent has traffic. Its blend is
 *    the best available proxy, and an agent usually runs one model.
 * 4. **`installation`** — neither. A fleet blend, honestly labelled.
 * 5. **`none`** — nothing was priced anywhere.
 *
 * Steps 3 and 4 only run when the model is genuinely unknowable — a BYO agent,
 * or a session whose `Agent` CR is not in view — which is also when a blend is
 * the only thing left.
 */
export function useTokenRates(
  installation: string | undefined,
  scope?: TokenRateScope,
): TokenRatesView {
  const cost = useMimirQuery({
    installationName: installation ?? '',
    query: tokenRateQueries.cost,
    enabled: Boolean(installation),
  });
  const tokens = useMimirQuery({
    installationName: installation ?? '',
    query: tokenRateQueries.tokens,
    enabled: Boolean(installation),
  });

  const namespace = scope?.namespace;
  const name = scope?.name;
  const model = scope?.model;

  const isLoading = cost.isLoading || tokens.isLoading;

  return useMemo(() => {
    const costSamples = cost.data?.data?.result;
    const tokenSamples = tokens.data?.data?.result;

    const rateFor = (filter: SampleFilter): TokenRates =>
      deriveTokenRates(
        totalsByTokenType(costSamples, filter),
        totalsByTokenType(tokenSamples, filter),
      );

    const resolved = ((): { rates: TokenRates; tier: TokenRateTier } => {
      // Before the answers arrive every tier derives no rate, so the chain
      // would otherwise fall through to `none` and the caller would state that
      // as a finding. Report the wait instead.
      if (isLoading) {
        return { rates: NO_RATES, tier: 'loading' };
      }

      if (model) {
        const byModel = rateFor({ model });
        // Known model, no observed price: stop here. See the docblock.
        return byModel.blended === undefined
          ? { rates: NO_RATES, tier: 'none' }
          : { rates: byModel, tier: 'model' };
      }

      if (namespace && name) {
        const byAgent = rateFor({ namespace, name });
        if (byAgent.blended !== undefined) {
          return { rates: byAgent, tier: 'agent' };
        }
      }

      const byInstallation = rateFor({});
      return byInstallation.blended === undefined
        ? { rates: NO_RATES, tier: 'none' }
        : { rates: byInstallation, tier: 'installation' };
    })();

    return {
      ...resolved,
      model,
      isLoading,
      isAvailable: cost.isAvailable,
      window: RATE_WINDOW,
    };
  }, [
    cost.data,
    cost.isAvailable,
    tokens.data,
    isLoading,
    namespace,
    name,
    model,
  ]);
}

type SampleFilter = { namespace?: string; name?: string; model?: string };

/**
 * Sum an instant vector by `gen_ai_token_type`, narrowed to a scope.
 *
 * A series with no `gen_ai_token_type` label lands under `''`, which is how
 * `deriveTokenRates` recognises that the cost metric does not split by type
 * and only a blended rate is available.
 */
function totalsByTokenType(
  samples: MimirMetricSample[] | undefined,
  filter: SampleFilter,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const sample of samples ?? []) {
    const labels = sample.metric ?? {};
    if (
      filter.namespace !== undefined &&
      labels.agent_namespace !== filter.namespace
    ) {
      continue;
    }
    if (filter.name !== undefined && labels.agent !== filter.name) {
      continue;
    }
    if (
      filter.model !== undefined &&
      labels.gen_ai_response_model !== filter.model
    ) {
      continue;
    }
    const value = Number(sample.value?.[1]);
    if (!Number.isFinite(value)) {
      continue;
    }
    const type = labels.gen_ai_token_type ?? '';
    totals[type] = (totals[type] ?? 0) + value;
  }
  return totals;
}
