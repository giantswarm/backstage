export interface Config {
  /** Configuration for the roadmap plugin */
  roadmap?: {
    /**
     * Board key of the GitHub Projects board to serve, as known by
     * `@giantswarm/pro` (`roadmap` or `customer`). Defaults to `roadmap`.
     * @visibility frontend
     */
    board?: string;
    /**
     * Teams offered in the board filter UI (values of the board's `Team`
     * single-select field, e.g. `Team Bumblebee🐝`). The first entry is the
     * default filter. When unset, all teams from the board schema are
     * offered and no default filter is applied.
     * @visibility frontend
     */
    teams?: string[];
  };
}
