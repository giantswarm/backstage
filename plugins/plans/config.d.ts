export interface Config {
  /** Frontend configuration for the plans plugin. */
  plans?: {
    /**
     * Serve the plans, the magazine and the knowledge documents from the
     * built-in fixtures instead of the plans backend: for local development
     * and design reviews without muster. Never set on a deployed portal.
     * @visibility frontend
     */
    fixtures?: boolean;
  };
}
