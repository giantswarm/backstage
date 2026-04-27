export interface Config {
  gs?: {
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
