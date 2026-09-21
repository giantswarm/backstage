export interface Config {
  /**
   * Configuration for AI Chat plugin. The frontend reads every key here from
   * the signed-in config (`GET /api/gs/config`), not from the public
   * `index.html`: none of it is needed to sign in.
   */
  aiChat?: {
    /** Optional: customize the welcome screen shown before the first message */
    welcome?: {
      /** Optional: override the welcome screen title. */
      title?: string;
      /** Optional: override the welcome screen subtitle. */
      subtitle?: string;
      /**
       * Optional: suggested questions shown as clickable cards.
       * When set, replaces the built-in list. Up to 3 are picked at
       * random per mount. An empty array hides the cards.
       */
      suggestions?: string[];
    };

    /** Optional: MCP servers configuration */
    mcp?: Array<{
      /**
       * Name of the MCP server entry; plugins look up an entry's auth
       * provider by it (e.g. the muster plugin).
       */
      name?: string;
      /** Optional: Auth provider name to use for this MCP server */
      authProvider?: string;
    }>;

    /**
     * Optional: override the context window size (in tokens) used to render
     * the context usage bar. When set, this value is used regardless of the
     * model name. When unset, a built-in lookup by model name prefix is used.
     */
    contextWindow?: number;
  };
}
