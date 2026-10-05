export interface Config {
  /** Configuration for the plans plugin */
  plans?: {
    /**
     * GitHub repositories containing plan documents, as `owner/repo` slugs
     * (e.g. `giantswarm/bumblebee-plans`). Routes select the active
     * repository via the `?repo=<owner/repo>` query parameter; when exactly
     * one repository is configured it is used by default. When unset, the
     * plans endpoints return 503 (the plugin is effectively disabled).
     */
    repositories?: string[];

    /**
     * The team product magazine shown on the Magazine page (`/product`): a
     * repository whose generated JSON (`magazine/*.json` on `ref`) and
     * knowledge documents (`knowledge/**` on `knowledgeRef`) are read through
     * the same muster GitHub access as the plans. A repository of its own
     * stays out of `repositories`, the plans picker and the epics crawl, and
     * only its two refs are readable. It may also be one of `repositories`,
     * the magazine kept on branches of that plan repository: the plan routes
     * stay as they are and the magazine reads ask for its refs. Without it
     * the Magazine page reports that it is not configured.
     *
     * Every key keeps the default backend visibility: the frontend learns
     * whether a magazine is configured from the authenticated `/magazine`
     * endpoint, so a private repository's name never reaches the
     * unauthenticated frontend config.
     */
    magazine?: {
      /** The magazine repository, as an `owner/repo` slug. */
      repository: string;
      /** Branch with the generated data. Default: `data`. */
      ref?: string;
      /** Branch with the knowledge documents. Default: `main`. */
      knowledgeRef?: string;
    };

    /**
     * Where GitHub is reached as the signed-in person: a GitHub MCP server
     * registered in a muster installation. The frontend forwards the user's
     * Dex ID token (the installation's `authProvider`), muster holds the
     * person's GitHub grant and runs the server's tools with it. Without this
     * block the plans endpoints return 503.
     */
    muster?: {
      /**
       * Name of the muster installation in `muster.installations`.
       */
      installation: string;
      /**
       * Name of the GitHub MCPServer in that muster -- the target of
       * `core_auth_login` when the person has no grant yet.
       */
      server: string;
      /**
       * Tool prefix muster exposes the server's tools under (tools are
       * `x_<prefix>_<tool>`). Default: the server name.
       */
      toolPrefix?: string;
    };
  };
}
