export interface Config {
  app: {
    /**
     * @deepVisibility frontend
     */
    errorReporter?: {
      sentry: {
        dsn: string;
        environment: string;
        releaseVersion: string;
        tracesSampleRate: number;
      };
    };

    /**
     * @deepVisibility frontend
     */
    telemetrydeck?: {
      appID: string;
      salt: string;
    };
  };
}
