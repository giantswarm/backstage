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
     * Overrides of, and additions to, the derived muster installations.
     *
     * The proxy derives one installation per `gs.installations` entry with a
     * `baseDomain`, at `https://muster.<baseDomain>/mcp`; an entry here with
     * the same `name` overrides that installation's `url`, `headers`,
     * `prometheusServer` and `authProvider` field by field, and an entry whose
     * name the fleet configuration does not know adds an installation (then
     * `url` is required). Routes select the active installation via the
     * `?installation=<name>` query parameter; `GET /installations` reports
     * each entry's `source` (`derived` or `configured`). When nothing is
     * derived and nothing is listed here, the proxy falls back to the legacy
     * single `aiChat.mcp` entry selected by `serverName`.
     */
    installations?: Array<{
      /**
       * Stable installation id used for routing and as the client cache scope.
       * Matches the `gs.installations` key to override a derived entry.
       * @visibility frontend
       */
      name: string;
      /**
       * Muster MCP aggregator endpoint, e.g. https://muster.<mc>.<domain>/mcp.
       * Defaults to the endpoint derived from the installation's `baseDomain`;
       * required for a name the fleet configuration does not know.
       */
      url?: string;
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
       * provider name, not a secret). A derived installation always requires
       * the person's token (every muster gates), with no provider name needed.
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
