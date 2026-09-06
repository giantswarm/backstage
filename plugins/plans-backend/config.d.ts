export interface Config {
  /** Configuration for the plans plugin */
  plans?: {
    /**
     * GitHub repositories containing plan documents, as `owner/repo` slugs
     * (e.g. `giantswarm/bumblebee-plans`). Routes select the active
     * repository via the `?repo=<owner/repo>` query parameter; when exactly
     * one repository is configured it is used by default. When unset, the
     * plans endpoints return 503 (the plugin is effectively disabled).
     * @visibility frontend
     */
    repositories?: string[];

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
       * @visibility frontend
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
