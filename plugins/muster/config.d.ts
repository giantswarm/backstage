export interface Config {
  /** Configuration for the muster plugin */
  muster?: {
    /**
     * Name of the entry in the `aiChat.mcp` server list that points at the
     * muster MCP server. Defaults to `muster`. Frontend-visible because the
     * frontend resolves the entry's auth provider by this name.
     * @visibility frontend
     */
    serverName?: string;

    /**
     * Muster installations the proxy can target. The full schema lives in the
     * muster-backend plugin; only the fields the frontend needs to forward the
     * right per-installation OAuth token are declared (and made visible) here.
     */
    installations?: Array<{
      /**
       * Stable installation id used for routing and as the client cache scope.
       * @visibility frontend
       */
      name: string;
      /**
       * Auth provider whose per-user OAuth token the frontend forwards for this
       * installation (a provider name, not a secret).
       * @visibility frontend
       */
      authProvider?: string;
    }>;
  };
}
