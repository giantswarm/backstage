import { ModelMessage } from 'ai';

export interface StripStats {
  strippedCount: number;
  approxBytesSaved: number;
}

export interface StripOptions {
  /**
   * Tool names whose historical results should be stripped.
   * Example: ['list_tools', 'list_core_tools']
   */
  toolNames: string[];
  /**
   * If true (default), the most recent tool-result for each target tool is
   * kept untouched so the model can still reason about the current turn.
   */
  keepMostRecent?: boolean;
}

/**
 * Replaces the `output` of tool-result parts for named tools with a short text
 * placeholder. The tool-call in the preceding assistant message is left
 * untouched, so the required tool_use / tool_result pairing is preserved.
 *
 * Motivation: a single call to e.g. `list_tools` from a muster MCP server can
 * return ~20K tokens that would otherwise be re-sent on every subsequent turn.
 */
export function stripStaleLargeToolResults(
  messages: ModelMessage[],
  options: StripOptions,
): { messages: ModelMessage[]; stats: StripStats } {
  const targets = new Set(options.toolNames);
  const keepMostRecent = options.keepMostRecent ?? true;

  if (targets.size === 0) {
    return { messages, stats: { strippedCount: 0, approxBytesSaved: 0 } };
  }

  // When keepMostRecent is true, find the last-occurring tool-result index
  // per tool name so we can skip those during the strip pass.
  const lastIndexByTool = new Map<string, { msg: number; part: number }>();
  if (keepMostRecent) {
    for (let m = 0; m < messages.length; m++) {
      const message = messages[m];
      if (message.role !== 'tool' || !Array.isArray(message.content)) continue;
      for (let p = 0; p < message.content.length; p++) {
        const part = message.content[p];
        if (
          part.type === 'tool-result' &&
          typeof part.toolName === 'string' &&
          targets.has(part.toolName)
        ) {
          lastIndexByTool.set(part.toolName, { msg: m, part: p });
        }
      }
    }
  }

  let strippedCount = 0;
  let approxBytesSaved = 0;

  const newMessages = messages.map((message, m) => {
    if (message.role !== 'tool' || !Array.isArray(message.content)) {
      return message;
    }

    let changed = false;
    const newContent = message.content.map((part, p) => {
      if (part.type !== 'tool-result') return part;
      if (typeof part.toolName !== 'string') return part;
      if (!targets.has(part.toolName)) return part;

      const last = lastIndexByTool.get(part.toolName);
      if (last && last.msg === m && last.part === p) return part;

      const placeholder = `[Tool result removed to save context. Call ${part.toolName} again if you need a fresh result.]`;
      const originalSize = JSON.stringify(part.output).length;
      approxBytesSaved += Math.max(0, originalSize - placeholder.length);
      strippedCount++;
      changed = true;

      return {
        ...part,
        output: {
          type: 'text' as const,
          value: placeholder,
        },
      };
    });

    return changed ? { ...message, content: newContent } : message;
  });

  return {
    messages: newMessages,
    stats: { strippedCount, approxBytesSaved },
  };
}
