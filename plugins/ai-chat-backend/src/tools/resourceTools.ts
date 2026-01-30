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
    // Create a short, unique tool name (max 128 chars for API)
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
    const toolName = `mcp_resource_${index}_${sanitizedName}`;

    tools[toolName] = tool({
      description: `Get MCP resource: ${name}`,
      inputSchema: z.object({}),
      execute: async () => content,
    });

    index++;
  }

  return tools;
}
