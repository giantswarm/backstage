export interface Config {
  /** Configuration for AI Chat plugin */
  aiChat?: {
    anthropic?: {
      /**
       * Anthropic API key
       * @visibility secret
       */
      apiKey: string;
      /**
       * Optional: custom base URL for Anthropic-compatible APIs
       * @visibility backend
       */
      baseUrl?: string;
    };

    openai?: {
      /**
       * OpenAI API key
       * @visibility secret
       */
      apiKey: string;
      /**
       * Optional: custom base URL for OpenAI-compatible APIs
       * @visibility backend
       */
      baseUrl?: string;
    };

    azure?: {
      /**
       * Azure OpenAI API key
       * @visibility secret
       */
      apiKey: string;
      /**
       * Azure resource name (used to construct endpoint URL)
       * @visibility backend
       */
      resourceName?: string;
      /**
       * Optional: full base URL (overrides resourceName)
       * @visibility backend
       */
      baseUrl?: string;
      /**
       * Optional: API version override
       * @visibility backend
       */
      apiVersion?: string;
    };

    /** Model to use for AI chat (default: gpt-4o-mini) */
    model?: string;

    /**
     * Optional: override the built-in system prompt. If set and non-empty,
     * replaces the bundled systemPrompt.md. MCP-specific additions (e.g.
     * muster prompt, failed-server notes) are still appended.
     * @visibility backend
     */
    systemPrompt?: string;

    /** Optional: MCP servers configuration */
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
       * @visibility secret
       */
      headers?: {
        [key: string]: string;
      };
      /** Optional: Auth provider name to use for this MCP server */
      authProvider?: string;
      /** Optional: Installation name to prefix tool names and description */
      installation?: string;
      /**
       * Optional: Custom session header name (e.g. 'X-Muster-Session-ID')
       * for servers that use non-standard session headers.
       * @visibility backend
       */
      sessionHeader?: string;
    }>;
  };
}
