/**
 * Context-window sizes for the chat's memory indicator.
 *
 * Nothing in the platform reports a hosted model's context window — kagent's
 * ModelConfig has no such field and model-manager only knows it for self-hosted
 * serving — so the sizes come from app-config
 * (`agentPlatform.models.contextWindows`), a table of model-name patterns to
 * window sizes in tokens. A model the table does not name simply has no known
 * window, and the UI falls back to showing the raw token count.
 */

/**
 * Whether `pattern` matches `model`. Case-insensitive; `*` matches any run of
 * characters, so `claude-*` covers every Claude model.
 */
function matches(pattern: string, model: string): boolean {
  const escaped = pattern
    .toLowerCase()
    .split('*')
    .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(model.toLowerCase());
}

/**
 * The configured context window for `model`, in tokens, or `undefined` when
 * the table does not name it.
 *
 * When several patterns match, the most specific one wins — the one with the
 * most literal (non-`*`) characters — so `claude-sonnet-4-5*` beats `claude-*`
 * whatever order the config lists them in. Entries whose value is not a
 * positive finite number are ignored rather than trusted: the table is plain
 * config, and a typo must not produce a negative or `NaN` percentage.
 */
export function contextWindowFor(
  model: string | undefined,
  windows: Record<string, unknown> | undefined,
): number | undefined {
  if (!model || !windows) {
    return undefined;
  }

  let best: { literals: number; tokens: number } | undefined;
  for (const [pattern, value] of Object.entries(windows)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    if (!pattern || !matches(pattern, model)) {
      continue;
    }
    const literals = pattern.replace(/\*/g, '').length;
    if (!best || literals > best.literals) {
      best = { literals, tokens: value };
    }
  }
  return best?.tokens;
}

export type MemoryUsage = {
  /** Tokens in the context — the newest turn's prompt tokens. */
  usedTokens: number;
  /** The model's window, when the config names it. */
  windowTokens?: number;
  /**
   * `usedTokens` as a share of the window, 0–100, when the window is known.
   * Capped at 100: the numerator is a per-turn sum over the turn's model calls,
   * so on a many-call turn it can exceed the window without the context ever
   * having done so — a bar past full would state something that did not happen.
   */
  percent?: number;
};

/**
 * How full the model's memory is, from the newest turn's prompt tokens and the
 * configured window. The numerator is the closest measurement that exists:
 * kagent records tokens per turn (summed over the turn's model calls), not per
 * call, so treat the figure as an approximation and say so wherever it shows.
 */
export function memoryUsage(
  usedTokens: number,
  windowTokens: number | undefined,
): MemoryUsage {
  const used = Number.isFinite(usedTokens) && usedTokens > 0 ? usedTokens : 0;
  if (
    windowTokens === undefined ||
    !Number.isFinite(windowTokens) ||
    windowTokens <= 0
  ) {
    return { usedTokens: used };
  }
  return {
    usedTokens: used,
    windowTokens,
    percent: Math.min(100, (used / windowTokens) * 100),
  };
}
