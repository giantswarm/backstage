import { tool, LanguageModelUsage } from 'ai';
import { z } from 'zod';

type UsageEntry = {
  /** Latest step usage — input tokens reflect the full context each step. */
  latest: LanguageModelUsage;
  /** Cumulative output tokens across all steps in the conversation. */
  cumulativeOutputTokens: number;
  modelName: string;
  recordedAt: number;
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * In-memory store for per-user token usage, keyed by `userRef:conversationId`.
 * Tracks the latest step's input data (which already includes the full context)
 * and accumulates output tokens across all steps.
 */
const usageByConversation = new Map<string, UsageEntry>();

function usageKey(userRef: string, conversationId?: string): string {
  return conversationId ? `${userRef}:${conversationId}` : userRef;
}

/**
 * Record usage data after a streamText step completes.
 * Called from onStepFinish so that the getContextUsage tool
 * can return data from the immediately preceding step.
 */
export function recordUsage(
  userRef: string,
  usage: LanguageModelUsage,
  modelName: string,
  conversationId?: string,
): { cumulativeInputTokens: number; cumulativeOutputTokens: number } {
  const key = usageKey(userRef, conversationId);
  const existing = usageByConversation.get(key);

  const cumulativeOutputTokens =
    (existing?.cumulativeOutputTokens ?? 0) + (usage.outputTokens ?? 0);

  usageByConversation.set(key, {
    latest: usage,
    cumulativeOutputTokens,
    modelName,
    recordedAt: Date.now(),
  });

  // Evict stale entries to prevent unbounded growth
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [k, val] of usageByConversation) {
    if (val.recordedAt < cutoff) usageByConversation.delete(k);
  }

  return {
    cumulativeInputTokens: usage.inputTokens ?? 0,
    cumulativeOutputTokens,
  };
}

/**
 * Creates the getContextUsage tool scoped to a specific user and conversation.
 */
export function createContextUsageTool(
  userRef: string,
  conversationId?: string,
) {
  return {
    getContextUsage: tool({
      description:
        'Returns token usage details for the current conversation. ' +
        'Input tokens reflect the current context size. Output tokens are cumulative ' +
        'across all turns. Call this when the user asks about context size, ' +
        'token usage, cost, model used, or how much of the context window is being used.',
      inputSchema: z.object({}),
      execute: async () => {
        const key = usageKey(userRef, conversationId);
        const entry = usageByConversation.get(key);
        if (!entry) {
          return {
            available: false,
            message:
              'No usage data available yet. Usage is tracked after each completed response.',
          };
        }

        const { latest } = entry;

        return {
          available: true,
          modelName: entry.modelName,
          inputTokens: latest.inputTokens ?? null,
          outputTokens: entry.cumulativeOutputTokens,
          inputTokenDetails: {
            cachedTokens: latest.inputTokenDetails?.cacheReadTokens ?? null,
            cacheWriteTokens:
              latest.inputTokenDetails?.cacheWriteTokens ?? null,
          },
          outputTokenDetails: {
            reasoningTokens: latest.outputTokenDetails?.reasoningTokens ?? null,
          },
        };
      },
    }),
  };
}
