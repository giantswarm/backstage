export interface Config {
  /** Configuration for AI Chat plugin */
  aiChat?: {
    anthropic?: {
      /** Anthropic API key */
      apiKey: string;
      /** Optional: custom base URL for Anthropic-compatible APIs */
      baseUrl?: string;
    };

    openai?: {
      /** OpenAI API key */
      apiKey: string;
      /** Optional: custom base URL for OpenAI-compatible APIs */
      baseUrl?: string;
    };

    /** Model to use for AI chat (default: gpt-4o-mini) */
    model?: string;

    /** Optional: MCP servers configuration */
    mcp?: {
      /** Name of the MCP server */
      name: string;
      /** URL of the MCP server */
      url: string;
      /** Optional: HTTP headers to send with requests */
      headers?: {
        [key: string]: string;
      };
    }[];
  };
}
