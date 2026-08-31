export interface Config {
  /** @visibility frontend */
  gs?: {
    /** @visibility frontend */
    adminGroups?: string[];

    /** @visibility frontend */
    authProvider: string;

    /**
     * Settings shared by the Giant Swarm OIDC login providers (the main sign-in
     * provider, the per-installation cluster-access providers and the `mcp-*`
     * providers).
     * @deepVisibility frontend
     */
    auth?: {
      /**
       * OIDC scopes requested on top of the fixed `openid profile email groups
       * offline_access` set. Applies to every login provider, and has no
       * default: an issuer-specific scope belongs to the deployment.
       *
       * A Dex deployment needs `federated:id`, which carries the
       * `federated_claims` the sign-in resolver maps onto a catalog entity, and
       * a cross-client `audience:server:client_id:<client>` scope for every
       * client whose audience a forwarded token must satisfy. Keycloak and
       * Entra ID reject both, and need no extra scope at all.
       */
      extraScopes?: string[];
    };

    /**
     * Sign-in page card of the main login provider. The defaults name Dex,
     * the Giant Swarm fleet's IdP; a deployment backed by another OIDC
     * issuer (Google, Keycloak, Entra ID) overrides these so the card
     * matches what actually handles the login.
     * @deepVisibility frontend
     */
    signInProvider?: {
      /** Card title. Default: `Dex`. */
      title?: string;
      /** Card message. Default: `Sign in using Dex`. */
      message?: string;
    };

    /**
     * Cluster token broker (muster) used to silently mint per-management-cluster
     * tokens from the user's main Dex session, replacing the per-cluster OAuth
     * popups for covered installations.
     */
    clusterTokenBroker?: {
      /**
       * OAuth token endpoint of the broker, e.g. https://muster.example.com/oauth/token.
       * Its presence enables the silent broker path in the frontend.
       * @visibility frontend
       */
      tokenUrl: string;
      /**
       * Confidential client ID registered with the broker.
       * @visibility backend
       */
      clientId: string;
      /**
       * @visibility secret
       */
      clientSecret: string;
      /**
       * Optional scope sent with the RFC 8693 exchange request. Usually unset:
       * the broker's per-audience configuration owns the scope set.
       * @visibility backend
       */
      scope?: string;
    };

    /** @deepVisibility frontend */
    clusterDetails?: {
      resources?: {
        label: string;
        icon: string;
        url: string;
        clusterType?: 'management' | 'workload';
      }[];
    };

    /** @deepVisibility frontend */
    deploymentDetails?: {
      resources?: {
        label: string;
        icon: string;
        url: string;
      }[];
    };

    /** @deepVisibility frontend */
    homepage?: {
      resources?: {
        label: string;
        icon: string;
        url: string;
      }[];
    };

    /**
     * The full installations map is intentionally backend-only: shipping it to
     * the unauthenticated frontend config deanonymizes customers (via
     * `baseDomain`) and leaks the installation topology. The SPA loads it from
     * the authenticated `GET /api/gs/installations` endpoint after sign-in.
     * @visibility backend
     */
    installations: {
      [installationName: string]: {
        pipeline: string;
        providers?: string[];
        authProvider: string;
        oidcTokenProvider?: string;
        /**
         * Audience requested from the cluster token broker for this
         * installation (typically the installation name). Setting it marks the
         * installation as fully covered by the broker and removes its entry
         * from the provider settings page.
         */
        clusterTokenAudience?: string;
        backendUrl?: string;
        baseDomain?: string;
        region?: string;
        apiVersionOverrides?: {
          [pluralKind: string]: string;
        };
      };
    };
    /** @deepVisibility frontend */
    friendlyAnnotations?: {
      selector: string;
      key?: string;
      valueMap?: {
        [v: string]: string;
      };
    }[];

    /** @deepVisibility frontend */
    friendlyLabels?: {
      selector: string;
      key?: string;
      valueMap?: {
        [v: string]: string;
      };
      variant?: string;
    }[];

    /** @deepVisibility frontend */
    kubernetesVersions?: {
      [minorVersion: string]: {
        eolDate: string;
        minorVersion: string;
      };
    };

    /** @deepVisibility frontend */
    kubernetes?: {
      /**
       * Per-request timeout (in milliseconds) for the Kubernetes proxy. Bounds
       * how long an unreachable management cluster can keep a request in-flight
       * before it becomes a fast, typed per-cluster error, so a single down
       * cluster cannot freeze the whole clusters list. Defaults to 10000.
       */
      proxyTimeoutMs?: number;
      /**
       * Maximum number of simultaneous in-flight Kubernetes proxy requests
       * across the whole app (including broker token mints). Bounds the
       * startup fan-out when every configured installation connects at once,
       * which otherwise overwhelms the broker and apiservers and produces
       * spurious timeouts that only resolve on retry. Defaults to 6.
       */
      proxyMaxConcurrency?: number;
    };
  };
}
