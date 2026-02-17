/**
 * Sanitizes model messages for Anthropic API compatibility:
 * 1. Ensures all tool call IDs are unique (Anthropic requires unique tool_use IDs)
 * 2. Ensures all tool calls have an `input` field (Anthropic requires it, even if empty)
 *
 * Uses a queue to match tool results with their corresponding tool calls.
 */
export function deduplicateToolCallIds(messages: any[]): any[] {
  const allSeenToolCallIds = new Set<string>();
  const pendingToolCalls: Array<{ originalId: string; renamedId: string }> = [];
  let counter = 0;

  return messages.map(message => {
    // Handle assistant messages with tool calls
    if (message.role === 'assistant' && Array.isArray(message.content)) {
      const newContent = message.content.map((part: any) => {
        if (part.type === 'tool-call' && part.toolCallId) {
          const originalId = part.toolCallId;

          // Ensure input is always defined (Anthropic requires tool_use.input)
          const sanitizedPart =
            part.input === undefined ? { ...part, input: {} } : part;

          if (allSeenToolCallIds.has(originalId)) {
            // Duplicate detected - generate new unique ID
            const newId = `${originalId}_dup${counter++}`;
            allSeenToolCallIds.add(newId);
            pendingToolCalls.push({ originalId, renamedId: newId });
            return { ...sanitizedPart, toolCallId: newId };
          }

          // First occurrence of this ID
          allSeenToolCallIds.add(originalId);
          pendingToolCalls.push({ originalId, renamedId: originalId });
          return sanitizedPart;
        }
        return part;
      });
      return { ...message, content: newContent };
    }

    // Handle tool result messages - match with corresponding tool call.
    // Tool messages contain an array of tool-result parts, each with its own
    // toolCallId (AI SDK v6 ToolModelMessage format).
    if (message.role === 'tool' && Array.isArray(message.content)) {
      const newContent = message.content.map((part: any) => {
        if (part.type === 'tool-result' && part.toolCallId) {
          const originalId = part.toolCallId;
          const index = pendingToolCalls.findIndex(
            p => p.originalId === originalId,
          );

          if (index !== -1) {
            const { renamedId } = pendingToolCalls[index];
            pendingToolCalls.splice(index, 1);
            return { ...part, toolCallId: renamedId };
          }
        }
        return part;
      });
      return { ...message, content: newContent };
    }

    return message;
  });
}
