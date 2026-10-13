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

    github?: {
      /**
       * Repository owners (GitHub organizations or users) the gs backend
       * uses the portal's GitHub credentials for when the repository URL is
       * caller-influenced: the `/github/raw-content` proxy, `/agent-skills`
       * discovery and the `get-helm-chart-values` MCP action. URLs under any
       * other owner are fetched without credentials, so only their public
       * content is reachable.
       *
       * Defaults to ["giantswarm"]. A portal whose GitHub integration reads
       * private repositories of other owners must list them here, or chart
       * previews and skill discovery for those owners return 404 after
       * rollout.
       * @visibility backend
       */
      allowedOwners?: string[];
    };
  };
}
