export interface Config {
  app: {
    /**
     * Short description of this portal, used as the `<meta name="description">`
     * of the served page. Keep it deployment-specific: it shows up in search
     * results and link previews.
     * @visibility frontend
     */
    description?: string;

    /**
     * In-app path that `/` redirects to, e.g. `/agent-platform`. Unset renders
     * the home page, and so does a value that does not start with `/` or that
     * is `/` itself. Set it for a single-product deployment whose landing page
     * is one plugin instead of the portal home page. The home page extension
     * (`page:home`) must stay enabled: it owns the `/` route.
     * @visibility frontend
     */
    rootRedirect?: string;

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

      /**
       * Optional palette overrides applied on top of the built-in Backstage
       * light/dark themes. Any key left unset falls back to the Backstage
       * default for that variant. Every color is public: the sign-in page
       * renders in the theme, before anyone is signed in.
       */
      theme?: {
        light?: {
          /**
           * Brand color used for primary accents (buttons, links, etc.).
           * @visibility frontend
           */
          primaryColor?: string;
          /**
           * Accent color used for secondary highlights.
           * @visibility frontend
           */
          secondaryColor?: string;
          /**
           * Page background color. Sets both the MUI `background.default`
           * palette token and the `--bui-bg-app` CSS variable used by
           * `@backstage/ui` components.
           * @visibility frontend
           */
          backgroundColor?: string;
          /**
           * Default body text color. Sets both the MUI `text.primary`
           * palette token and the `--bui-fg-primary` CSS variable used by
           * `@backstage/ui` components.
           * @visibility frontend
           */
          textColor?: string;
          /**
           * Surface background tier 1. Sets the `--bui-bg-neutral-1` CSS
           * variable used by `@backstage/ui` components.
           * @visibility frontend
           */
          neutralBackground1?: string;
          /**
           * Surface background tier 2. Sets the `--bui-bg-neutral-2` CSS
           * variable used by `@backstage/ui` components.
           * @visibility frontend
           */
          neutralBackground2?: string;
          /**
           * Surface background tier 3. Sets the `--bui-bg-neutral-3` CSS
           * variable used by `@backstage/ui` components.
           * @visibility frontend
           */
          neutralBackground3?: string;
          /**
           * Surface background tier 4. Sets the `--bui-bg-neutral-4` CSS
           * variable used by `@backstage/ui` components.
           * @visibility frontend
           */
          neutralBackground4?: string;
          /** Sidebar / navigation palette overrides. */
          navigation?: {
            /**
             * Background color of the sidebar.
             * @visibility frontend
             */
            background?: string;
            /**
             * Color of the active-route indicator strip.
             * @visibility frontend
             */
            indicator?: string;
            /**
             * Default color of nav item icons and labels.
             * @visibility frontend
             */
            color?: string;
            /**
             * Color used for the currently selected nav item.
             * @visibility frontend
             */
            selectedColor?: string;
          };
        };
        dark?: {
          /**
           * Brand color used for primary accents (buttons, links, etc.).
           * @visibility frontend
           */
          primaryColor?: string;
          /**
           * Accent color used for secondary highlights.
           * @visibility frontend
           */
          secondaryColor?: string;
          /**
           * Page background color. Sets both the MUI `background.default`
           * palette token and the `--bui-bg-app` CSS variable used by
           * `@backstage/ui` components.
           * @visibility frontend
           */
          backgroundColor?: string;
          /**
           * Default body text color. Sets both the MUI `text.primary`
           * palette token and the `--bui-fg-primary` CSS variable used by
           * `@backstage/ui` components.
           * @visibility frontend
           */
          textColor?: string;
          /**
           * Surface background tier 1. Sets the `--bui-bg-neutral-1` CSS
           * variable used by `@backstage/ui` components.
           * @visibility frontend
           */
          neutralBackground1?: string;
          /**
           * Surface background tier 2. Sets the `--bui-bg-neutral-2` CSS
           * variable used by `@backstage/ui` components.
           * @visibility frontend
           */
          neutralBackground2?: string;
          /**
           * Surface background tier 3. Sets the `--bui-bg-neutral-3` CSS
           * variable used by `@backstage/ui` components.
           * @visibility frontend
           */
          neutralBackground3?: string;
          /**
           * Surface background tier 4. Sets the `--bui-bg-neutral-4` CSS
           * variable used by `@backstage/ui` components.
           * @visibility frontend
           */
          neutralBackground4?: string;
          /** Sidebar / navigation palette overrides. */
          navigation?: {
            /**
             * Background color of the sidebar.
             * @visibility frontend
             */
            background?: string;
            /**
             * Color of the active-route indicator strip.
             * @visibility frontend
             */
            indicator?: string;
            /**
             * Default color of nav item icons and labels.
             * @visibility frontend
             */
            color?: string;
            /**
             * Color used for the currently selected nav item.
             * @visibility frontend
             */
            selectedColor?: string;
          };
        };
      };
    };

    /**
     * Sentry error reporting of the frontend. Initialised at app boot, before
     * anyone is signed in, so every field is public; the DSN is the public
     * client key Sentry issues for browsers.
     */
    errorReporter?: {
      sentry: {
        /** @visibility frontend */
        dsn: string;
        /** @visibility frontend */
        environment: string;
        /** @visibility frontend */
        releaseVersion: string;
        /** @visibility frontend */
        tracesSampleRate: number;
      };
    };

    /**
     * TelemetryDeck page-view analytics of the frontend. Initialised at app
     * boot, so both fields are public; the salt only hashes the user id.
     */
    telemetrydeck?: {
      /** @visibility frontend */
      appID: string;
      /** @visibility frontend */
      salt: string;
    };
  };
}
