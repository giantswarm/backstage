import { ModelMessage } from 'ai';

const CHARS_PER_TOKEN = 4;
const PLACEHOLDER_TEXT = '[Old tool result content cleared]';

export interface PruneStats {
  prunedCount: number;
  /**
   * Total tokens of tool output eligible for pruning past the protected
   * window. Populated whether or not the prune was committed, so callers
   * can detect near-misses (eligible content held back by the savings gate).
   */
  prunableTokens: number;
}

export interface PruneOptions {
  /**
   * How many tokens of recent tool output to keep verbatim, beyond the
   * always-protected window of the most recent user turn. Older tool
   * results past this cumulative budget are replaced with a placeholder.
   */
  reservedTokens: number;
  /**
   * Minimum tokens that pruning would need to save in order to commit
   * the prune. Avoids flicker for trivial prunes.
   */
  minimumSavingsTokens: number;
  /**
   * Tool names whose results are never pruned — for tools whose output is
   * meant to remain authoritative across the whole conversation.
   */
  protectedTools?: string[];
}

function estimateTokens(value: unknown): number {
  const text =
    typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
  return Math.max(0, Math.round(text.length / CHARS_PER_TOKEN));
}

/**
 * Replaces the `output` of older tool-result parts with a short placeholder
 * once cumulative tool output exceeds `reservedTokens` past the most recent
 * user turn. Mirrors OpenCode's `compaction.prune`: the most recent user turn
 * (and everything after it) is fully protected; further back, results within
 * a `reservedTokens` budget are kept; older ones are cleared.
 *
 * Stateless — recomputed on every request from the messages provided by the
 * frontend.
 */
export function pruneOldToolResults(
  messages: ModelMessage[],
  options: PruneOptions,
): { messages: ModelMessage[]; stats: PruneStats } {
  const protectedTools = new Set(options.protectedTools ?? []);

  const toPrune = new Set<string>();
  let userTurnsSeen = 0;
  let cumulativeTokens = 0;
  let prunableTokens = 0;

  for (let m = messages.length - 1; m >= 0; m--) {
    const message = messages[m];
    if (message.role === 'user') {
      userTurnsSeen++;
    }
    if (userTurnsSeen < 2) continue;

    if (message.role !== 'tool' || !Array.isArray(message.content)) continue;

    for (let p = 0; p < message.content.length; p++) {
      const part = message.content[p];
      if (part.type !== 'tool-result') continue;
      if (typeof part.toolName !== 'string') continue;
      if (protectedTools.has(part.toolName)) continue;

      const tokens = estimateTokens(part.output);
      cumulativeTokens += tokens;
      if (cumulativeTokens > options.reservedTokens) {
        toPrune.add(`${m}:${p}`);
        prunableTokens += tokens;
      }
    }
  }

  if (prunableTokens < options.minimumSavingsTokens) {
    return { messages, stats: { prunedCount: 0, prunableTokens } };
  }

  const newMessages = messages.map((message, m) => {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      return message;
    }

    let changed = false;
    const newContent = message.content.map((part, p) => {
      if (!toPrune.has(`${m}:${p}`)) return part;
      changed = true;
      return {
        ...part,
        output: { type: 'text' as const, value: PLACEHOLDER_TEXT },
      };
    });

    return changed ? { ...message, content: newContent } : message;
  });

  return {
    messages: newMessages,
    stats: {
      prunedCount: toPrune.size,
      prunableTokens,
    },
  };
}
