export interface Config {
  app: {
    /**
     * @visibility frontend
     */
    errorReporter?: {
      /**
       * @visibility frontend
       */
      sentry: {
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
        tracesSampleRate: number;
      }
    }
  }
}
