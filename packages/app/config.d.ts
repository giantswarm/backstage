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

      /**
       * Optional palette overrides applied on top of the built-in Backstage
       * light/dark themes. Any key left unset falls back to the Backstage
       * default for that variant.
       * @deepVisibility frontend
       */
      theme?: {
        light?: {
          /** Brand color used for primary accents (buttons, links, etc.). */
          primaryColor?: string;
          /** Accent color used for secondary highlights. */
          secondaryColor?: string;
          /**
           * Page background color. Sets both the MUI `background.default`
           * palette token and the `--bui-bg-app` CSS variable used by
           * `@backstage/ui` components.
           */
          backgroundColor?: string;
          /**
           * Default body text color. Sets both the MUI `text.primary`
           * palette token and the `--bui-fg-primary` CSS variable used by
           * `@backstage/ui` components.
           */
          textColor?: string;
          /**
           * Surface background tier 1. Sets the `--bui-bg-neutral-1` CSS
           * variable used by `@backstage/ui` components.
           */
          neutralBackground1?: string;
          /**
           * Surface background tier 2. Sets the `--bui-bg-neutral-2` CSS
           * variable used by `@backstage/ui` components.
           */
          neutralBackground2?: string;
          /**
           * Surface background tier 3. Sets the `--bui-bg-neutral-3` CSS
           * variable used by `@backstage/ui` components.
           */
          neutralBackground3?: string;
          /**
           * Surface background tier 4. Sets the `--bui-bg-neutral-4` CSS
           * variable used by `@backstage/ui` components.
           */
          neutralBackground4?: string;
          /** Sidebar / navigation palette overrides. */
          navigation?: {
            /** Background color of the sidebar. */
            background?: string;
            /** Color of the active-route indicator strip. */
            indicator?: string;
            /** Default color of nav item icons and labels. */
            color?: string;
            /** Color used for the currently selected nav item. */
            selectedColor?: string;
          };
        };
        dark?: {
          /** Brand color used for primary accents (buttons, links, etc.). */
          primaryColor?: string;
          /** Accent color used for secondary highlights. */
          secondaryColor?: string;
          /**
           * Page background color. Sets both the MUI `background.default`
           * palette token and the `--bui-bg-app` CSS variable used by
           * `@backstage/ui` components.
           */
          backgroundColor?: string;
          /**
           * Default body text color. Sets both the MUI `text.primary`
           * palette token and the `--bui-fg-primary` CSS variable used by
           * `@backstage/ui` components.
           */
          textColor?: string;
          /**
           * Surface background tier 1. Sets the `--bui-bg-neutral-1` CSS
           * variable used by `@backstage/ui` components.
           */
          neutralBackground1?: string;
          /**
           * Surface background tier 2. Sets the `--bui-bg-neutral-2` CSS
           * variable used by `@backstage/ui` components.
           */
          neutralBackground2?: string;
          /**
           * Surface background tier 3. Sets the `--bui-bg-neutral-3` CSS
           * variable used by `@backstage/ui` components.
           */
          neutralBackground3?: string;
          /**
           * Surface background tier 4. Sets the `--bui-bg-neutral-4` CSS
           * variable used by `@backstage/ui` components.
           */
          neutralBackground4?: string;
          /** Sidebar / navigation palette overrides. */
          navigation?: {
            /** Background color of the sidebar. */
            background?: string;
            /** Color of the active-route indicator strip. */
            indicator?: string;
            /** Default color of nav item icons and labels. */
            color?: string;
            /** Color used for the currently selected nav item. */
            selectedColor?: string;
          };
        };
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
