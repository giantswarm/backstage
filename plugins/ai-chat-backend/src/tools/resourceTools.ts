import { tool, ToolSet } from 'ai';
import { z } from 'zod';

/**
 * Convert MCP resources to tools that can be called on-demand
 */
export function createResourceTools(resources: {
  [resourceName: string]: string;
}) {
  const tools: ToolSet = {};
  let index = 0;
  for (const [name, content] of Object.entries(resources)) {
    // Create a short, unique tool name (max 64 chars)
    const MAX_TOOL_NAME_LENGTH = 64;
    const prefix = `mcp_resource_${index}_`;
    const maxNameLength = MAX_TOOL_NAME_LENGTH - prefix.length;
    const sanitizedName = name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/_$/, '')
      .substring(0, maxNameLength)
      .replace(/_$/, '');
    const toolName = `${prefix}${sanitizedName}`;

    tools[toolName] = tool({
      description: `Get MCP resource: ${name}`,
      inputSchema: z.object({}),
      execute: async () => content,
    });

    index++;
  }

  return tools;
}
