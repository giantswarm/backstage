export interface Config {
  agentPlatform?: {
    /**
     * Access to the kagent REST API, used by the Agent Platform "Sessions"
     * list. The backend proxies kagent per installation, forwarding the user's
     * per-installation Dex ID token as `Authorization: Bearer`.
     *
     * The frontend never talks to kagent directly: the browser cannot reach
     * `kagent.<baseDomain>` cross-origin, and the installation base domains are
     * deliberately backend-only (they deanonymize customers).
     *
     * Every key here therefore keeps the default **backend** visibility — none
     * of it is served to the unauthenticated frontend config. `apiBaseUrl`
     * embeds `baseDomain`, so marking any of it `@visibility frontend` would
     * leak the installation topology to anyone loading the page, which is the
     * same reason `gs.installations` is backend-only. The frontend learns the
     * installation *names* from the authenticated
     * `GET /api/agent-platform/kagent/installations` route instead.
     */
    kagent?: {
      /**
       * Per-request timeout in milliseconds toward a kagent API. Bounds how
       * long an installation whose `kagent.<baseDomain>` host does not resolve
       * (i.e. kagent simply is not deployed there) can hold a request open.
       * Defaults to 10000.
       */
      timeoutMs?: number;

      /**
       * Installations to proxy kagent for, keyed by installation name — the
       * same keys as `gs.installations`.
       *
       * When omitted, every entry in `gs.installations` that has a
       * `baseDomain` is derived as `https://kagent.<baseDomain>/api`, and
       * installations without kagent simply fail per request and are treated
       * as "not installed". Set this to restrict the fan-out to the
       * installations that actually run kagent, or to point one at a
       * non-default URL. An entry with no fields (`{}`) means "enabled, use
       * the derived URL".
       */
      installations?: {
        [installationName: string]: {
          /**
           * Full kagent API base URL for this installation, overriding the
           * derived `https://kagent.<baseDomain>/api`. No trailing slash.
           *
           * Use this to point at a different ingress — for example the
           * agentgateway door (`https://agentgateway.<baseDomain>/kagent/api`)
           * on installations where the oauth2-proxy-fronted kagent hostname is
           * not available.
           */
          apiBaseUrl?: string;
        };
      };
    };
  };
}
