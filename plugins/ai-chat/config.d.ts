export interface Config {
  /**
   * Configuration for AI Chat plugin
   * @visibility frontend
   */
  aiChat?: {
    anthropic?: {
      /**
       * Anthropic API key
       * @visibility secret
       */
      apiKey: string;
      /** Optional: custom base URL for Anthropic-compatible APIs */
      baseUrl?: string;
    };

    openai?: {
      /**
       * OpenAI API key
       * @visibility secret
       */
      apiKey: string;
      /** Optional: custom base URL for OpenAI-compatible APIs */
      baseUrl?: string;
    };

    /** Model to use for AI chat (default: gpt-4o-mini) */
    model?: string;

    /**
     * Optional: MCP servers configuration
     * @deepVisibility frontend
     */
    mcp?: Array<{
      /** Name of the MCP server */
      name: string;
      /** Optional: purpose of the MCP server */
      description?: string;
      /**
       * URL of the MCP server
       * @visibility backend
       */
      url: string;
      /**
       * Optional: HTTP headers to send with requests
       * @visibility backend
       */
      headers?: {
        [key: string]: string;
      };
      /** Optional: Auth provider name to use for this MCP server */
      authProvider?: string;
      /** Optional: Installation name to prefix tool names and descriptions */
      installation?: string;
    }>;
  };
}
