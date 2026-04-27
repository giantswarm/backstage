export interface Config {
  app: {
    branding?: {
      /**
       * Filesystem path where custom branding assets (logos, favicons) are stored.
       * Assets in this directory are served at /api/branding/<filename>.
       * @visibility backend
       */
      assetsPath?: string;
    };

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
