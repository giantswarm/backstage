export interface Config {
  /** Configuration for the roadmap plugin */
  roadmap?: {
    /**
     * Board key served by this portal (`roadmap` or `customer`, as pro names
     * them). When unset, the roadmap endpoints return 503 (the plugin is
     * effectively disabled).
     * @visibility frontend
     */
    board?: string;
    /**
     * Teams shown by default in the frontend's filter.
     * @visibility frontend
     */
    teams?: string[];

    /**
     * Where the board is reached as the signed-in person: the pro MCP server
     * registered in a muster installation. The frontend forwards the user's
     * Dex ID token (the installation's `authProvider`), muster runs pro's
     * board tools with the person's own GitHub grant -- reads and writes
     * alike. Without this block the roadmap endpoints return 503.
     */
    muster?: {
      /**
       * Name of the muster installation in `muster.installations`.
       * @visibility frontend
       */
      installation: string;
      /** Name of the pro MCPServer in that muster (the `core_auth_login` target). */
      server: string;
      /**
       * Tool prefix muster exposes the server's tools under (tools are
       * `x_<prefix>_<tool>`). Default: the server name.
       */
      toolPrefix?: string;
    };
  };
}
