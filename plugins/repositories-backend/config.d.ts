export interface Config {
  /** Configuration for the repositories plugin (the Repositories page). */
  repositories?: {
    /**
     * Where giantswarm-repo-manager is reached as the signed-in person: the
     * manager's MCPServer registered in a muster installation. The frontend
     * forwards the user's Dex ID token (the installation's `authProvider`),
     * muster validates it and the manager obtains the person's GitHub grant
     * from muster's token broker. Without this block the repositories
     * endpoints return 503.
     */
    muster?: {
      /**
       * Name of the muster installation in `muster.installations`.
       */
      installation: string;
      /**
       * Name of the manager's MCPServer in that muster (`giantswarm-repo-manager`)
       * -- the target of `core_auth_login` when the person has no grant yet.
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
