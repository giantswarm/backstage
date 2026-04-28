export interface Config {
  app: {
    branding?: {
      /**
       * Filesystem path where custom branding assets (logos, favicons) are stored.
       * Assets in this directory are served at /api/branding/<filename>.
       * @visibility backend
       */
      assetsPath?: string;

      logo?: {
        /**
         * Height (in pixels) for the sidebar logo image. Applied only when a
         * custom branding logo asset is rendered.
         * @visibility frontend
         */
        height?: number;
      };
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
