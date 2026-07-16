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
      /**
       * Thinking effort for adaptive-thinking Claude models (Opus 4.5+,
       * Sonnet 4.6). Maps to output_config.effort. Ignored by older Claude
       * models, which use a fixed thinking budget instead. Defaults to 'high'.
       * @visibility backend
       */
      effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
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

    google?: {
      /**
       * GCP project ID for Vertex AI.
       * @visibility backend
       */
      project?: string;
      /**
       * Vertex AI region, e.g. `europe-west1`.
       * @visibility backend
       */
      location?: string;
      /**
       * Path to the mounted Google Cloud service-account JSON, used by
       * google-auth-library to mint and auto-refresh short-lived OAuth2
       * access tokens. Required for Vertex (`gemini-*`) models.
       * @visibility backend
       */
      keyFilename?: string;
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

    /**
     * Sampling parameters passed through to the underlying provider via
     * the Vercel AI SDK's `streamText` call. All fields are optional; when
     * unset, the provider/server defaults apply (e.g. vLLM defaults to
     * `temperature=1.0, top_p=1.0, top_k=-1, seed=null`, which is far too
     * loose for tool-using agents and the dominant cause of token-cost
     * variance in production agent loops).
     *
     * Recommended values are model-specific -- see the model card for the
     * model `aiChat.model` points at. The README has a "Sampling" section
     * with recipes for common model families (Qwen3 thinking-mode, Qwen3
     * non-thinking, GPT-4 / GPT-4o, Anthropic Claude).
     */
    sampling?: {
      /**
       * `0.0` = greedy decoding, `> 0` = sample. Provider/server default
       * applies if unset. NOTE: Do not use greedy (`0`) for thinking-mode
       * models like Qwen3 -- the Qwen team explicitly warns it leads to
       * performance degradation and endless repetitions.
       * @visibility backend
       */
      temperature?: number;
      /**
       * Nucleus sampling cutoff in `(0, 1]`.
       * @visibility backend
       */
      topP?: number;
      /**
       * Top-K sampling cutoff. Not supported by all providers; the AI SDK
       * routes it through provider options where applicable.
       * @visibility backend
       */
      topK?: number;
      /**
       * Min-P sampling cutoff in `[0, 1)`. Not supported by all providers;
       * the AI SDK routes it through provider options where applicable.
       * @visibility backend
       */
      minP?: number;
      /**
       * Fixed seed. Combined with `temperature: 0`, makes single-turn
       * responses bit-identical across runs. Recommended ONLY for
       * evaluation / regression-test deployments; omit in production so
       * users don't see the same deterministic answer to ambiguous
       * questions.
       * @visibility backend
       */
      seed?: number;
      /**
       * Optional maximum number of output tokens per step.
       * @visibility backend
       */
      maxOutputTokens?: number;
    };

    /**
     * Sources of expert-knowledge skills exposed to the model via the
     * `listSkills` and `getSkill` tools. The plugin ships a default set
     * of bundled skills; deployments can opt out and/or extend them with
     * additional sources. If no skills end up loaded, the tools are
     * omitted from the toolset entirely.
     *
     * Merge order (later wins on name collision): bundled → `dir` → `inline`.
     */
    skills?: {
      /**
       * Whether to load the skills bundled with the plugin. Defaults to
       * `true`. Set to `false` to opt out and rely solely on `dir` and/or
       * `inline`.
       * @visibility backend
       */
      bundled?: boolean;

      /**
       * Absolute path to a directory of `*.md` files. Each file becomes a
       * skill named after its basename (e.g. `grafana.md` → `grafana`).
       * Loaded once at backend startup. Entries override bundled skills
       * with the same name.
       * @visibility backend
       */
      dir?: string;

      /**
       * Inline skills. Entries override bundled and `dir` skills with the
       * same name.
       * @visibility backend
       */
      inline?: Array<{
        /** Topic name (lowercase-with-hyphens recommended). */
        name: string;
        /** Markdown content of the skill. */
        content: string;
      }>;
    };

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
    }>;
  };
}
