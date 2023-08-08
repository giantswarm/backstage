export interface SentryConfig {
  /**
   * @visibility frontend
   */
  dsn: string;

  /**
   * @visibility frontend
   */
  environment: string;

  /**
   * @visibility frontend
   */
  releaseVersion: string;

  /**
   * @visibility frontend
   */
  sampleRate: number;
}

export interface Config {
  app: {
    /**
     * @visibility frontend
     */
    errorReporter: {
      /**
       * @visibility frontend
       */
      sentry: SentryConfig;
    }
  }
}
