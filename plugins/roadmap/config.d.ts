export interface Config {
  /** Frontend configuration for the roadmap plugin. */
  roadmap?: {
    /**
     * Serve the board from the built-in fixture board instead of the
     * roadmap backend: for local development and design reviews without
     * muster. Never set on a deployed portal.
     * @visibility frontend
     */
    fixtures?: boolean;
  };
}
