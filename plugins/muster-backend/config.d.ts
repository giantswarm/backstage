export interface Config {
  /** Configuration for the muster plugin */
  muster?: {
    /**
     * Name of the entry in the `aiChat.mcp` server list that points at the
     * muster MCP server. Used only for the legacy single-installation setup
     * (when `muster.installations` is not set). Defaults to `muster`.
     * @visibility frontend
     */
    serverName?: string;

    /**
     * Muster installations the proxy can target. A single muster federates
     * many management clusters; list one entry per muster aggregator. Routes
     * select the active installation via the `?installation=<name>` query
     * parameter. When omitted, the proxy falls back to the legacy single
     * `aiChat.mcp` entry selected by `serverName`.
     */
    installations?: Array<{
      /**
       * Stable installation id used for routing and as the client cache scope.
       * @visibility frontend
       */
      name: string;
      /** Muster MCP aggregator endpoint, e.g. https://muster.<mc>.<domain>/mcp */
      url: string;
      /**
       * Auth provider whose per-user OAuth token the frontend forwards for
       * this installation. When set, requests without a forwarded token are
       * rejected with 401.
       */
      authProvider?: string;
      /**
       * Allow mutating `call_tool` invocations (and workflow runs) against
       * this installation. Defaults to false: the proxy is read-only.
       */
      allowMutations?: boolean;
      /** Static headers added to every request to this installation. */
      headers?: { [key: string]: string };
    }>;
  };
}
