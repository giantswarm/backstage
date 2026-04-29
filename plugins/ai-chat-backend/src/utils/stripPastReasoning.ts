import { ModelMessage } from 'ai';

const CHARS_PER_TOKEN = 4;

export interface StripPastReasoningStats {
  strippedCount: number;
  approxTokensSaved: number;
}

/**
 * Removes `reasoning` content parts from assistant messages older than the
 * two most recent user turns. The most recent user turn (and the one before
 * it) keeps reasoning intact, which is required for Anthropic extended
 * thinking + tool_use mid-loop: the thinking block tied to a still-pending
 * tool_use must round-trip with the next request.
 *
 * Stateless — recomputed on every request from the messages provided by the
 * frontend.
 */
export function stripPastReasoning(messages: ModelMessage[]): {
  messages: ModelMessage[];
  stats: StripPastReasoningStats;
} {
  // Find the boundary: index of the second-most-recent user message.
  // Messages at this index and later are protected.
  let userTurnsSeen = 0;
  let protectedFromIndex = -1;
  for (let m = messages.length - 1; m >= 0; m--) {
    if (messages[m].role === 'user') {
      userTurnsSeen++;
      if (userTurnsSeen === 2) {
        protectedFromIndex = m;
        break;
      }
    }
  }
  if (protectedFromIndex === -1) {
    return { messages, stats: { strippedCount: 0, approxTokensSaved: 0 } };
  }

  let strippedCount = 0;
  let approxTokensSaved = 0;
  let changed = false;

  const newMessages = messages.map((message, m) => {
    if (m >= protectedFromIndex) return message;
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      return message;
    }
    const filtered = message.content.filter(part => {
      if (part.type !== 'reasoning') return true;
      strippedCount++;
      approxTokensSaved += Math.round(part.text.length / CHARS_PER_TOKEN);
      return false;
    });
    if (filtered.length === message.content.length) return message;
    changed = true;
    return { ...message, content: filtered };
  });

  return {
    messages: changed ? newMessages : messages,
    stats: { strippedCount, approxTokensSaved },
  };
}
