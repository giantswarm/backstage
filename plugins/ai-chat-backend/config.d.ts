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
      /**
       * Which OpenAI-compatible endpoint to talk to:
       *   - "responses" (default): the OpenAI Responses API
       *     (`/v1/responses`). Recommended for real OpenAI.
       *   - "chat": the OpenAI Chat Completions API
       *     (`/v1/chat/completions`). Use this for vLLM and other
       *     OpenAI-compatible servers that don't yet implement the
       *     Responses API correctly (notably vLLM <= 0.x crashes with
       *     `KeyError: 'role'` when the SDK posts `function_call_output`
       *     items back to `/v1/responses`).
       * @visibility backend
       */
      api?: 'responses' | 'chat';
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

    /**
     * Maximum number of agent steps (model invocations) per chat turn.
     * Each tool call consumes one step, so this also bounds tool-call depth.
     * Defaults to 20.
     */
    maxSteps?: number;

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
      /**
       * Optional: when true, the chat backend mints a Backstage token on
       * behalf of the calling user (via the AuthService) scoped to the
       * built-in `mcp-actions` plugin and sends it to this MCP server as
       * `Authorization: Bearer <token>`. Use this for the in-process
       * `mcp-actions` MCP server so requests run as the logged-in user.
       */
      useBackstageUserToken?: boolean;
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
