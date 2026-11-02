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

    githubRawContent?: {
      /**
       * Repository owners (GitHub organizations or users) the
       * `/github/raw-content` proxy attaches the portal's GitHub
       * credentials for. URLs under any other owner are fetched without
       * credentials, so only their public content is reachable.
       * Defaults to ["giantswarm"].
       * @visibility backend
       */
      allowedOwners?: string[];
    };
  };
}
