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
       * Marks this installation as requiring a per-user token: requests
       * without a forwarded token are rejected with 401, and `/installations`
       * reports it as `requiresAuth`.
       *
       * Which token the frontend forwards depends on the installation. For the
       * HOME installation (the `gs.installations` entry whose
       * `oidcTokenProvider` is `gs.authProvider`; the only installation on a
       * standalone install) it is this provider's token -- with no dedicated
       * `mcp-*` provider configured, the person's main-login Dex ID token,
       * which the home muster trusts. For every OTHER installation the value
       * is not used to pick a token: the frontend forwards the token the
       * cluster token broker mints for that installation (issued by its own
       * Dex, `aud: [dex-k8s-authenticator, …]`), which that muster trusts and
       * the kagent/model-manager proxies already send. Frontend-visible (a
       * provider name, not a secret).
       * @visibility frontend
       */
      authProvider?: string;
      /** Static headers added to every request to this installation. */
      headers?: { [key: string]: string };
      /**
       * Name of the MCP server (as registered in muster) fronting this
       * installation's own Prometheus/Mimir, used by the MCP usage view.
       * Defaults to the `<name>-mcp-prometheus` naming convention, then to
       * the only prometheus-ish server registered.
       */
      prometheusServer?: string;
    }>;
  };
}
