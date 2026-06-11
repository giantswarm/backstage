export interface Config {
  /** Configuration for the muster plugin */
  muster?: {
    /**
     * Name of the entry in the `aiChat.mcp` server list that points at the
     * muster MCP server. Defaults to `muster`. Frontend-visible because the
     * frontend resolves the entry's auth provider by this name.
     * @visibility frontend
     */
    serverName?: string;
  };
}
