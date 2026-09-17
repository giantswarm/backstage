export interface Config {
  /**
   * Configuration for the Repositories plugin.
   */
  repositories?: {
    /**
     * Muster configuration.
     */
    muster?: {
      /**
       * The muster MCPServer that fronts giantswarm-repo-manager.
       * @visibility backend
       */
      server?: string;
      /**
       * The muster MCPServer that holds the GitHub grant the manager acts
       * with. When the manager answers that the person has no GitHub grant
       * yet, the backend replies 401 with this server's connect URL so the
       * page sends the person through GitHub's consent. Optional: when unset
       * the manager's answer is passed through unchanged.
       * @visibility backend
       */
      grantServer?: string;
    };
  };
}
