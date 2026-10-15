import type { ContextReading } from '@giantswarm/backstage-plugin-agent-platform-common';

/**
 * Context-window sizes for the chat's context indicator.
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

/**
 * How full the model's context window is, in one of the states the indicator
 * shows. Each state carries exactly the figures it may show, so a share never
 * sits beside numbers that contradict it.
 */
export type ContextUsage =
  /** No turn has reported usage yet. */
  | { kind: 'none' }
  /**
   * The runtime reports only a turn total summed over several model calls (the
   * claude Harness), which is no single call's context: there is nothing to
   * show as context without inventing it.
   */
  | { kind: 'unmeasured' }
  /** The table names no window for the model: the raw count only. */
  | { kind: 'tokens'; usedTokens: number }
  /** The share of the window, 0–100. */
  | { kind: 'share'; usedTokens: number; windowTokens: number; percent: number }
  /**
   * The model was sent more than the configured window. A model cannot take
   * more than its window, so the configured window is evidently wrong — too
   * small, or matched by a pattern meant for another model. The raw count
   * stands, and no share is claimed.
   */
  | { kind: 'over-window'; usedTokens: number; windowTokens: number };

/**
 * How full the model's context window is, from the newest usage reading (see
 * `SessionTimeline.context`) and the configured window.
 */
export function contextUsage(
  reading: ContextReading | undefined,
  windowTokens: number | undefined,
): ContextUsage {
  if (!reading) {
    return { kind: 'none' };
  }
  if (reading.calls > 1) {
    return { kind: 'unmeasured' };
  }
  const usedTokens = reading.promptTokens;
  if (!Number.isFinite(usedTokens) || usedTokens <= 0) {
    return { kind: 'none' };
  }
  if (
    windowTokens === undefined ||
    !Number.isFinite(windowTokens) ||
    windowTokens <= 0
  ) {
    return { kind: 'tokens', usedTokens };
  }
  if (usedTokens > windowTokens) {
    return { kind: 'over-window', usedTokens, windowTokens };
  }
  return {
    kind: 'share',
    usedTokens,
    windowTokens,
    percent: (usedTokens / windowTokens) * 100,
  };
}
