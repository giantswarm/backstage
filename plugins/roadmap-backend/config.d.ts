export interface Config {
  /** Configuration for the roadmap plugin */
  roadmap?: {
    /**
     * Which pro board to serve. One of the board keys known to
     * `@giantswarm-io/pro` (`roadmap`, `customer`). When unset, the
     * roadmap endpoints return 503 (the plugin is effectively disabled).
     * @visibility frontend
     */
    board?: string;
    /**
     * Team field values the portal scopes its views to by default
     * (e.g. `Bumblebee🐝`). Exposed to the frontend via `GET /schema`;
     * the frontend applies it as the initial Team filter. When unset,
     * no default team filter is applied.
     * @visibility frontend
     */
    teams?: string[];
  };
}
