// Claude models that use adaptive thinking + the `effort` parameter instead of
// the legacy `thinking: { type: 'enabled', budgetTokens }` interface. On these
// models the enabled+budgetTokens shape returns a 400:
//   "thinking.type.enabled is not supported for this model. Use
//    thinking.type.adaptive and output_config.effort to control thinking."
// Opus 4.5+ and Sonnet 4.6 introduced adaptive thinking and `effort`; older
// Claude models (Sonnet 4.5, Haiku 4.5, Opus 4.1, Claude 3.x) still require
// enabled+budgetTokens and reject `effort`. Adaptive-thinking models also
// reject temperature/top_p/top_k. Extend this list as new effort-generation
// models ship (keep roughly in sync with ContextUsageDisplay.tsx).
export const ADAPTIVE_THINKING_MODEL_PREFIXES = [
  'claude-opus-4-5',
  'claude-opus-4-6',
  'claude-opus-4-7',
  'claude-opus-4-8',
  'claude-sonnet-4-6',
];

// Thinking budget for legacy (pre-effort) Claude models.
export const LEGACY_THINKING_BUDGET_TOKENS = 10000;

// Default effort for adaptive-thinking models. `high` is the Opus 4.8 default
// and the recommended minimum for intelligence-sensitive work.
export const DEFAULT_ANTHROPIC_EFFORT = 'high';

/**
 * Whether a Claude model uses the adaptive-thinking + `effort` interface
 * rather than the legacy `thinking: { type: 'enabled', budgetTokens }` shape.
 *
 * Uses `startsWith` so date-suffixed IDs (e.g. `claude-opus-4-5-20251101`)
 * still match their family prefix.
 */
export function usesAdaptiveThinking(modelName: string): boolean {
  return ADAPTIVE_THINKING_MODEL_PREFIXES.some(prefix =>
    modelName.startsWith(prefix),
  );
}

// Value passed under `providerOptions.anthropic`. Both shapes are JSON-safe so
// the result is assignable to the AI SDK's `providerOptions`.
export type AnthropicProviderOptions =
  | { thinking: { type: 'adaptive' }; effort: string }
  | { thinking: { type: 'enabled'; budgetTokens: number } };

/**
 * Build the value passed under `providerOptions.anthropic` for a given model.
 *
 * - Non-Anthropic models: `undefined` (no Anthropic provider options).
 * - Adaptive-thinking models (Opus 4.5+, Sonnet 4.6): adaptive thinking plus
 *   `effort` (`output_config.effort`), defaulting to `high`.
 * - Older Claude models: the legacy fixed thinking budget; `effort` is omitted
 *   because those models reject it.
 */
export function buildAnthropicProviderOptions(opts: {
  modelName: string;
  isAnthropicModel: boolean;
  effort?: string;
}): AnthropicProviderOptions | undefined {
  const {
    modelName,
    isAnthropicModel,
    effort = DEFAULT_ANTHROPIC_EFFORT,
  } = opts;

  if (!isAnthropicModel) {
    return undefined;
  }

  if (usesAdaptiveThinking(modelName)) {
    return { thinking: { type: 'adaptive' }, effort };
  }

  return {
    thinking: { type: 'enabled', budgetTokens: LEGACY_THINKING_BUDGET_TOKENS },
  };
}
