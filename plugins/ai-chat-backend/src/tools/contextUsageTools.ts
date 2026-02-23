import { tool, LanguageModelUsage } from 'ai';
import { z } from 'zod';

type UsageEntry = LanguageModelUsage & {
  modelName: string;
  recordedAt: number;
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * In-memory store for per-user token usage from the most recently completed
 * step. Updated via onStepFinish so data is available within the same
 * multi-step stream before the next tool call.
 */
const usageByUser = new Map<string, UsageEntry>();

/**
 * Record usage data after a streamText step completes.
 * Called from onStepFinish so that the getContextUsage tool
 * can return data from the immediately preceding step.
 */
export function recordUsage(
  userRef: string,
  usage: LanguageModelUsage,
  modelName: string,
) {
  usageByUser.set(userRef, { ...usage, modelName, recordedAt: Date.now() });

  // Evict stale entries to prevent unbounded growth
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const [key, val] of usageByUser) {
    if (val.recordedAt < cutoff) usageByUser.delete(key);
  }
}

/**
 * Creates the getContextUsage tool scoped to a specific user.
 */
export function createContextUsageTool(userRef: string) {
  return {
    getContextUsage: tool({
      description:
        'Returns token usage details from the most recent completed step for the current user. ' +
        'Includes input tokens, output tokens, total tokens, cache details (for Anthropic), ' +
        'and reasoning token breakdown. Call this when the user asks about context size, ' +
        'token usage, or how much of the context window is being used.',
      inputSchema: z.object({}),
      execute: async () => {
        const usage = usageByUser.get(userRef);
        if (!usage) {
          return {
            available: false,
            message:
              'No usage data available yet. Usage is tracked after each completed response.',
          };
        }

        return {
          available: true,
          modelName: usage.modelName,
          inputTokens: usage.inputTokens ?? null,
          outputTokens: usage.outputTokens ?? null,
          totalTokens: usage.totalTokens ?? null,
          inputTokenDetails: {
            cachedTokens: usage.inputTokenDetails?.cacheReadTokens ?? null,
            cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? null,
            uncachedTokens: usage.inputTokenDetails?.noCacheTokens ?? null,
          },
          outputTokenDetails: {
            textTokens: usage.outputTokenDetails?.textTokens ?? null,
            reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? null,
          },
        };
      },
    }),
  };
}
