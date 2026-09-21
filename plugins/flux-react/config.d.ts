export interface Config {
  /**
   * Configuration of the Flux plugin. The frontend reads it from the
   * signed-in config (`GET /api/gs/config`), not from the public
   * `index.html`: the patterns name Git hosts.
   */
  flux?: {
    /** Link templates for the Flux sources' Git hosts, matched in order. */
    gitRepositoryPatterns?: {
      targetUrl: string;
      gitRepositoryUrlPattern: string;
    }[];
  };
}
