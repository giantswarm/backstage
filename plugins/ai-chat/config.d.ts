export interface Config {
  /** Configuration for AI Chat plugin */
  aiChat?: {
    /** Optional: MCP servers configuration */
    mcp?: Array<{
      /**
       * Optional: Auth provider name to use for this MCP server
       * @visibility frontend
       */
      authProvider?: string;
    }>;
  };
}
