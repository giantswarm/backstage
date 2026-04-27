export interface Config {
  /** Configuration for AI Chat plugin */
  aiChat?: {
    /** Optional: customize the welcome screen shown before the first message */
    welcome?: {
      /**
       * Optional: override the welcome screen title.
       * @visibility frontend
       */
      title?: string;
      /**
       * Optional: override the welcome screen subtitle.
       * @visibility frontend
       */
      subtitle?: string;
      /**
       * Optional: suggested questions shown as clickable cards.
       * When set, replaces the built-in list. Up to 3 are picked at
       * random per mount. An empty array hides the cards.
       * @visibility frontend
       */
      suggestions?: string[];
    };

    /** Optional: MCP servers configuration */
    mcp?: Array<{
      /**
       * Optional: Auth provider name to use for this MCP server
       * @visibility frontend
       */
      authProvider?: string;
    }>;

    /**
     * Optional: override the context window size (in tokens) used to render
     * the context usage bar. When set, this value is used regardless of the
     * model name. When unset, a built-in lookup by model name prefix is used.
     * @visibility frontend
     */
    contextWindow?: number;
  };
}
