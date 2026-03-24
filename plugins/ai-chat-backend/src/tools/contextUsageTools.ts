import { tool, LanguageModelUsage } from 'ai';
import { z } from 'zod/v3';

type UsageEntry = {
  /** Latest step usage — input tokens reflect the full context each step. */
  latest: LanguageModelUsage;
  /**
   * Sum of output tokens from all previous requests in this conversation.
   * Does not include the current request's output (which is tracked via
   * `currentRequestOutputTokens`).
   */
  previousOutputTokens: number;
  /**
   * The aggregated output tokens reported by onStepFinish for the current
   * request. Since onStepFinish reports cumulative usage across steps within
   * a request, we replace (not add) on each step.
   */
  currentRequestOutputTokens: number;
  /** Opaque ID of the current request, used to detect request boundaries. */
  currentRequestId: string | undefined;
  modelName: string;
  recordedAt: number;
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * In-memory store for per-user token usage, keyed by `userRef:conversationId`.
 * Tracks the latest step's input data (which already includes the full context)
 * and accumulates output tokens across requests.
 */
const usageByConversation = new Map<string, UsageEntry>();

function usageKey(userRef: string, conversationId?: string): string {
  return conversationId ? `${userRef}:${conversationId}` : userRef;
}

/**
 * Record usage data after a streamText step completes.
 * Called from onStepFinish. The AI SDK reports aggregated usage across all
 * steps within a single request, so we replace (not accumulate) within the
 * same requestId and accumulate across different requestIds.
 */
export function recordUsage(
  userRef: string,
  usage: LanguageModelUsage,
  modelName: string,
  conversationId?: string,
  requestId?: string,
): { cumulativeInputTokens: number; cumulativeOutputTokens: number } {
  const key = usageKey(userRef, conversationId);
  const existing = usageByConversation.get(key);

  let previousOutputTokens = existing?.previousOutputTokens ?? 0;

  // When a new request starts, roll the previous request's output into the total
  if (existing && existing.currentRequestId !== requestId) {
    previousOutputTokens += existing.currentRequestOutputTokens;
  }

  const currentRequestOutputTokens = usage.outputTokens ?? 0;
  const cumulativeOutputTokens =
    previousOutputTokens + currentRequestOutputTokens;

  usageByConversation.set(key, {
    latest: usage,
    previousOutputTokens,
    currentRequestOutputTokens,
    currentRequestId: requestId,
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
        const cumulativeOutputTokens =
          entry.previousOutputTokens + entry.currentRequestOutputTokens;

        return {
          available: true,
          modelName: entry.modelName,
          inputTokens: latest.inputTokens ?? null,
          outputTokens: cumulativeOutputTokens,
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
