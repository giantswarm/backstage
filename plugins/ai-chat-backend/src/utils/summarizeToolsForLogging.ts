import { ToolSet } from 'ai';

interface ToolSummary {
  description?: string;
  parameters?: unknown;
}

/**
 * Extracts tool names, descriptions, and JSON schemas from a ToolSet
 * for debugging purposes. Handles the various schema formats used by
 * the Vercel AI SDK (Zod, JSON Schema wrapper, lazy schemas).
 */
export function summarizeToolsForLogging(
  tools: ToolSet,
): Record<string, ToolSummary> {
  const summary: Record<string, ToolSummary> = {};

  for (const [name, tool] of Object.entries(tools)) {
    const entry: ToolSummary = {};

    if (tool.description) {
      entry.description = tool.description;
    }

    // Extract JSON schema from the various FlexibleSchema formats
    const schema = tool.inputSchema;
    if (schema != null) {
      if (typeof schema === 'function') {
        // LazySchema — call it to get the Schema object
        try {
          const resolved = schema();
          entry.parameters = resolved?.jsonSchema ?? '[lazy - could not resolve]';
        } catch {
          entry.parameters = '[lazy - error resolving]';
        }
      } else if ('jsonSchema' in schema) {
        // Schema object (from jsonSchema() wrapper)
        entry.parameters = schema.jsonSchema;
      } else if ('~standard' in schema) {
        // Standard/Zod schema — extract via standard schema protocol
        try {
          const std = (schema as any)['~standard'];
          if (std?.jsonSchema?.input) {
            entry.parameters = std.jsonSchema.input({ target: 'draft-07' });
          } else {
            entry.parameters = '[standard schema - no jsonSchema]';
          }
        } catch {
          entry.parameters = '[standard schema - error resolving]';
        }
      } else {
        entry.parameters = schema;
      }
    }

    summary[name] = entry;
  }

  return summary;
}
