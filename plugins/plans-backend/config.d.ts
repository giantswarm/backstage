export interface Config {
  /** Configuration for the plans plugin */
  plans?: {
    /**
     * GitHub repositories containing plan documents, as `owner/repo` slugs
     * (e.g. `giantswarm/bumblebee-plans`). Routes select the active
     * repository via the `?repo=<owner/repo>` query parameter; when exactly
     * one repository is configured it is used by default. When unset, the
     * plans endpoints return 503 (the plugin is effectively disabled).
     * @visibility frontend
     */
    repositories?: string[];
  };
}
