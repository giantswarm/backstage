/**
 * Ensures all tool call IDs in the message array are unique.
 * Anthropic API requires tool_use IDs to be unique across all messages.
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

          if (allSeenToolCallIds.has(originalId)) {
            // Duplicate detected - generate new unique ID
            const newId = `${originalId}_dup${counter++}`;
            allSeenToolCallIds.add(newId);
            pendingToolCalls.push({ originalId, renamedId: newId });
            return { ...part, toolCallId: newId };
          }

          // First occurrence of this ID
          allSeenToolCallIds.add(originalId);
          pendingToolCalls.push({ originalId, renamedId: originalId });
        }
        return part;
      });
      return { ...message, content: newContent };
    }

    // Handle tool result messages - match with corresponding tool call
    if (message.role === 'tool' && message.toolCallId) {
      const originalId = message.toolCallId;
      // Find the first pending tool call with this original ID (FIFO order)
      const index = pendingToolCalls.findIndex(
        p => p.originalId === originalId,
      );

      if (index !== -1) {
        const { renamedId } = pendingToolCalls[index];
        pendingToolCalls.splice(index, 1); // Remove from pending queue
        return { ...message, toolCallId: renamedId };
      }
    }

    return message;
  });
}
