export interface Config {
  /** Configuration for the platform-capabilities plugin (the Installations page's capability columns and Capabilities tab). */
  platformCapabilities?: {
    /**
     * Where giantswarm-platform-manager is reached as the signed-in person:
     * the manager's MCPServer registered in a muster installation. The
     * frontend forwards the user's Dex ID token, muster validates it and the
     * manager reads the registry and the installations' repositories with
     * the person's GitHub grant from muster's token broker. Without this
     * block the endpoints return 503 and the page shows no capabilities.
     */
    muster?: {
      /**
       * Name of the muster installation in `muster.installations`.
       * @visibility frontend
       */
      installation: string;
      /**
       * Name of the manager's MCPServer in that muster
       * (`giantswarm-platform-manager`) -- the target of `core_auth_login`
       * when the person has no grant yet.
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
