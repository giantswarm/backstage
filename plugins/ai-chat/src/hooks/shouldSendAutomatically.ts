import {
  lastAssistantMessageIsCompleteWithToolCalls,
  isToolUIPart,
  getToolName,
  type UIMessage,
} from 'ai';
import { toolInputRequiredOf } from '@giantswarm/backstage-plugin-gs-common';

/**
 * Tools whose results are rendered as self-contained UI cards.
 * When the last assistant step contains ONLY these tools, we skip the
 * automatic re-send so the model does not generate redundant prose.
 */
const SELF_RENDERING_TOOLS = new Set(['getContextUsage']);

/**
 * Whether the chat sends the conversation on by itself once the last
 * assistant message's tool calls all have their output.
 */
export function shouldSendAutomatically({
  messages,
}: {
  messages: UIMessage[];
}): boolean {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
    return false;
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'assistant') return false;

  const lastStepStart = lastMessage.parts.reduce(
    (idx, part, i) => (part.type === 'step-start' ? i : idx),
    -1,
  );

  const toolParts = lastMessage.parts
    .slice(lastStepStart + 1)
    .filter(isToolUIPart);

  if (
    toolParts.length > 0 &&
    toolParts.every(part => SELF_RENDERING_TOOLS.has(getToolName(part)))
  ) {
    return false;
  }

  // A call muster answered with a sign-in waits for the person's answer,
  // whose retry gives it the output the model reads.
  if (toolParts.some(part => toolInputRequiredOf(part.output))) {
    return false;
  }

  return true;
}
