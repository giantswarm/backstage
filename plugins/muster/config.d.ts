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
     * Overrides of the muster installations the backend derives from
     * `gs.installations` (`https://muster.<baseDomain>/mcp` per entry with a
     * `baseDomain`). The full schema lives in the muster-backend plugin; only
     * the fields the frontend needs to forward the right per-installation
     * token are declared (and made visible) here. The picker itself lists the
     * installations whose inventory has the `muster.giantswarm.io` API group,
     * not this list.
     */
    installations?: Array<{
      /**
       * Stable installation id used for routing and as the client cache scope.
       * @visibility frontend
       */
      name: string;
      /**
       * Marks the installation as requiring a per-user token. Only the home
       * installation (the `gs.installations` entry whose `oidcTokenProvider`
       * is `gs.authProvider`) forwards this provider's token; every other
       * installation is reached with the token the cluster token broker mints
       * for it, and the value is not consulted beyond "requires a token". A
       * provider name, not a secret. A derived installation without an entry
       * here requires a token whenever the backend says so (`requiresAuth` on
       * `GET /api/muster/installations`).
       * @visibility frontend
       */
      authProvider?: string;
    }>;
  };
}
