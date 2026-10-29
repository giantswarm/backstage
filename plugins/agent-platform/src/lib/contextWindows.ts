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
 * What the context-window table says about a model: its window; that only
 * entries with an unusable value name it (`pattern` is the most specific of
 * them), so the setting needs fixing rather than adding; or nothing.
 */
export type ContextWindowLookup =
  | { kind: 'window'; tokens: number }
  | { kind: 'invalid'; pattern: string }
  | { kind: 'none' };

/**
 * Looks `model` up in the context-window table.
 *
 * When several patterns match, the most specific one wins — the one with the
 * most literal (non-`*`) characters — so `claude-sonnet-4-5*` beats `claude-*`
 * whatever order the config lists them in. Entries whose value is not a
 * positive finite number are ignored rather than trusted: the table is plain
 * config, and a typo must not produce a negative or `NaN` percentage. A model
 * only such entries match is `invalid`, so the page can say which to fix.
 */
export function lookUpContextWindow(
  model: string | undefined,
  windows: Record<string, unknown> | undefined,
): ContextWindowLookup {
  if (!model || !windows) {
    return { kind: 'none' };
  }

  let best: { literals: number; tokens: number } | undefined;
  let invalid: { literals: number; pattern: string } | undefined;
  for (const [pattern, value] of Object.entries(windows)) {
    if (!pattern || !matches(pattern, model)) {
      continue;
    }
    const literals = pattern.replace(/\*/g, '').length;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      if (!invalid || literals > invalid.literals) {
        invalid = { literals, pattern };
      }
      continue;
    }
    if (!best || literals > best.literals) {
      best = { literals, tokens: value };
    }
  }
  if (best) {
    return { kind: 'window', tokens: best.tokens };
  }
  return invalid
    ? { kind: 'invalid', pattern: invalid.pattern }
    : { kind: 'none' };
}

/**
 * The configured context window for `model`, in tokens, or `undefined` when
 * the table does not name it with a usable value (`lookUpContextWindow`).
 */
export function contextWindowFor(
  model: string | undefined,
  windows: Record<string, unknown> | undefined,
): number | undefined {
  const lookup = lookUpContextWindow(model, windows);
  return lookup.kind === 'window' ? lookup.tokens : undefined;
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
   * The runtime reports only a turn total summed over several model calls, or
   * one whose call count it did not say (the claude Harness), which is no
   * single call's context: there is nothing to show without inventing it.
   */
  | { kind: 'unmeasured' }
  /** The table names no window for the model: the raw count only. */
  | { kind: 'tokens'; usedTokens: number }
  /** The share of the window, 0–100. */
  | { kind: 'share'; usedTokens: number; windowTokens: number; percent: number }
  /**
   * A call counted more than the configured window. No call can exceed its
   * model's window, so the window does not fit the call: the setting is too
   * small, or matched by a pattern meant for another model, or the turn ran on
   * a model the agent has since left (the window is looked up for the agent's
   * current model). The raw count stands, and no share is claimed.
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
  if (!reading.perCall) {
    return { kind: 'unmeasured' };
  }
  const usedTokens = reading.tokens;
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
