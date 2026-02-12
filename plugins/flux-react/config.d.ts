export interface Config {
  /** @visibility frontend */
  flux?: {
    /** @deepVisibility frontend */
    gitRepositoryPatterns?: {
      targetUrl: string;
      gitRepositoryUrlPattern: string;
    }[];
  };
}
