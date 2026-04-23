export interface Config {
  gs?: {
    branding?: {
      /**
       * Filesystem path where custom branding assets (logos, backgrounds) are stored.
       * Assets in this directory are served at /api/gs/branding/<filename>.
       * @visibility backend
       */
      assetsPath?: string;
    };
    containerRegistry?: {
      registries?: {
        /**
         * The hostname of the container registry.
         * @visibility backend
         */
        host: string;

        /**
         * The username for authenticating with the registry.
         * @visibility secret
         */
        username: string;

        /**
         * The password for authenticating with the registry.
         * @visibility secret
         */
        password: string;
      }[];
    };
  };
}
