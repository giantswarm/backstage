export interface Config {
  /**
   * The GitHub Actions tab of the catalog (community plugin
   * `@backstage-community/plugin-github-actions`) served as the signed-in
   * person through muster instead of a GitHub token in the browser.
   */
  githubActions?: {
    /**
     * GitHub's `actions` toolset (workflow runs, jobs, logs, re-runs) as an
     * MCPServer in a muster installation -- the remote GitHub MCP server at
     * `https://api.githubcopilot.com/mcp/x/actions/`. The frontend forwards
     * the user's Dex ID token (the installation's `authProvider`), muster runs
     * the tools with the person's own GitHub grant. Without this block the
     * GitHub Actions tab keeps using the Backstage `github` auth provider.
     */
    muster?: {
      /**
       * Name of the muster installation in `muster.installations`.
       * @visibility frontend
       */
      installation: string;
      /**
       * Name of the MCPServer in that muster (the `core_auth_login` target).
       * @visibility frontend
       */
      server: string;
      /**
       * Tool prefix muster exposes the server's tools under (tools are
       * `x_<prefix>_<tool>`). Default: the server name.
       */
      toolPrefix?: string;
    };
    /**
     * Repository reads the tab needs besides the runs (the default branch,
     * the branch list): GitHub's default toolsets as an MCPServer in the same
     * muster, typically the `github` server the plans plugin uses. Defaults
     * to `githubActions.muster` when omitted.
     */
    repos?: {
      muster?: {
        /** Name of the muster installation in `muster.installations`. */
        installation: string;
        /** Name of the MCPServer in that muster. */
        server: string;
        /** Tool prefix of that server. Default: the server name. */
        toolPrefix?: string;
      };
    };
  };
}
