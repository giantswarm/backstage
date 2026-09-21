/**
 * Configuration of the Giant Swarm plugin.
 *
 * Two tiers reach the browser. `@visibility frontend` marks what the sign-in
 * page needs before anyone is signed in; it is served to every visitor in the
 * unauthenticated `index.html`, so it is the minimum: the main provider, the
 * login scopes, the two sign-in cards. Everything else here keeps the default
 * (backend) visibility and reaches the browser through the authenticated
 * `GET /api/gs/config` after sign-in, listed in the gs-backend plugin's
 * `SIGNED_IN_CONFIG_PATHS` and read through
 * `@giantswarm/backstage-plugin-gs-react`. A new key that the browser reads
 * goes there; `@visibility frontend` is only for what the sign-in needs.
 */
export interface Config {
  gs?: {
    /**
     * Groups whose members the portal treats as Giant Swarm staff (the
     * cluster-access and SSH cards), matched against the installation
     * token's `groups`. Signed-in config.
     */
    adminGroups?: string[];

    /**
     * Name of the main login provider under `auth.providers`; the sign-in
     * page initiates its flow, so it is public.
     * @visibility frontend
     */
    authProvider: string;

    /**
     * Settings shared by the Giant Swarm OIDC login providers (the main sign-in
     * provider, the per-installation cluster-access providers and the `mcp-*`
     * providers). Both scope lists are requested by the sign-in itself, so
     * they are public.
     */
    auth?: {
      /**
       * Full replacement for the default base scope set (`openid profile
       * email groups offline_access`), for issuers that reject scopes they
       * don't know. Google fails the whole authorization request on
       * `groups`/`offline_access` and needs `[openid, profile, email]` here.
       * Unset keeps the default base set.
       * @visibility frontend
       */
      scopes?: string[];

      /**
       * OIDC scopes requested on top of the base scope set (`openid profile
       * email groups offline_access`, or `scopes` when set). Applies to every
       * login provider, and has no
       * default: an issuer-specific scope belongs to the deployment.
       *
       * A Dex deployment needs `federated:id`, which carries the
       * `federated_claims` the sign-in resolver maps onto a catalog entity, and
       * a cross-client `audience:server:client_id:<client>` scope for every
       * client whose audience a forwarded token must satisfy. Keycloak and
       * Entra ID reject both, and need no extra scope at all.
       * @visibility frontend
       */
      extraScopes?: string[];
    };

    /**
     * Sign-in page card of the main login provider. The defaults name Dex,
     * the Giant Swarm fleet's IdP; a deployment backed by another OIDC
     * issuer (Google, Keycloak, Entra ID) overrides these so the card
     * matches what actually handles the login. Rendered before sign-in, so
     * public.
     */
    signInProvider?: {
      /**
       * Card title. Default: `Dex`.
       * @visibility frontend
       */
      title?: string;
      /**
       * Card message. Default: `Sign in using Dex`.
       * @visibility frontend
       */
      message?: string;
    };

    /**
     * Second sign-in card next to the main provider's, signing in through the
     * same OIDC login provider but pinned to another Dex connector
     * (`connector_id` on the authorization request). The main card uses the
     * deployment's default connector -- set it with the login provider's
     * `startUrlSearchParams.connector_id` -- and this card is the fallback for
     * people that connector cannot sign in. Both cards yield the same portal
     * session. Without `connectorId` the login page shows the main card alone
     * and signs in automatically. Rendered before sign-in, so public.
     */
    signInFallbackProvider?: {
      /**
       * Dex connector id, e.g. `giantswarm-ad`. Optional as the login page
       * treats it: without it the card is not shown.
       * @visibility frontend
       */
      connectorId?: string;
      /**
       * Card title. Default: `Other identity provider`.
       * @visibility frontend
       */
      title?: string;
      /**
       * Card message. Default: `Sign in through another identity provider`.
       * @visibility frontend
       */
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
       * Its presence enables the silent broker path in the frontend, which
       * learns it from the signed-in config: the URL names an internal host.
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

    /**
     * GitHub as the signed-in person for Backstage's standard GitHub auth API
     * (`githubAuthApiRef`, used by the GitHub Actions and Pull Requests tabs,
     * `ScmAuth` and the scaffolder pickers) without a GitHub App or GitHub
     * login in the portal: the token is the person's own GitHub grant held
     * by muster (the grant behind `plans.muster` / `roadmap.muster`),
     * released to the portal's backend through muster's token broker
     * (`gs.clusterTokenBroker` credentials, RFC 8693, audience
     * `brokerAudience`). A person without a grant is sent through muster's
     * connect once -- a full-page bounce that comes straight back for an App
     * they already authorized at their login -- never a "Login Required"
     * dialog. Signing out of GitHub in the settings revokes the grant in
     * muster for every session. Unset keeps the upstream GitHub auth
     * provider (`auth.providers.github`).
     */
    github?: {
      /**
       * Audience of the broker grant target that releases the GitHub grant
       * (`tokenExchangeBroker.targets.<audience>.grantIssuer` in muster).
       * Its presence switches the frontend's GitHub auth API to muster. The
       * app decides that when it constructs its utility APIs, before anyone
       * is signed in, so this stays public: an audience name, and the one
       * key of this block the browser sees.
       * @visibility frontend
       */
      brokerAudience: string;
      /**
       * The muster installation and MCPServer whose grant this is: the
       * server a person without a grant is asked to connect
       * (`core_auth_login`, the sign-in URL of the bounce) and signed out of
       * (`core_auth_logout`). Same shape as `plans.muster`.
       * @visibility backend
       */
      muster: {
        /** Name of the muster installation in `muster.installations`. */
        installation: string;
        /** Name of the MCPServer in that muster, e.g. `github`. */
        server: string;
        /** Tool prefix muster exposes the server's tools under; default: the server name. */
        toolPrefix?: string;
      };
    };

    /**
     * Link templates on the cluster details page. They carry the fleet's
     * hostnames, so they are signed-in config.
     */
    clusterDetails?: {
      resources?: {
        label: string;
        icon: string;
        url: string;
        clusterType?: 'management' | 'workload';
      }[];
    };

    /** Link templates on the deployment details page. Signed-in config. */
    deploymentDetails?: {
      resources?: {
        label: string;
        icon: string;
        url: string;
      }[];
    };

    /** Links on the home page. Signed-in config. */
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
     * `baseDomain`) and leaks the installation topology. The SPA reads it from
     * the signed-in config after sign-in.
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
        /**
         * Whether the installation runs the Giant Swarm observability stack
         * (Mimir at `observability.<baseDomain>`). Defaults to true. Standalone
         * installations set this to false so metrics-backed UI renders neutral
         * "unavailable" states instead of errors — `baseDomain` alone can't
         * carry this meaning because other features (e.g. agent avatars)
         * require it on every installation.
         */
        mimirEnabled?: boolean;
        apiVersionOverrides?: {
          [pluralKind: string]: string;
        };
      };
    };

    /**
     * Which Kubernetes annotations the cluster and deployment pages show, and
     * how. Signed-in config.
     */
    friendlyAnnotations?: {
      selector: string;
      key?: string;
      valueMap?: {
        [v: string]: string;
      };
    }[];

    /**
     * Which Kubernetes labels the cluster and deployment pages show, and how.
     * Signed-in config.
     */
    friendlyLabels?: {
      selector: string;
      key?: string;
      valueMap?: {
        [v: string]: string;
      };
      variant?: string;
    }[];

    /** End-of-life dates per Kubernetes minor version. Signed-in config. */
    kubernetesVersions?: {
      [minorVersion: string]: {
        eolDate: string;
        minorVersion: string;
      };
    };

    /** Tuning of the frontend's Kubernetes proxy client. Signed-in config. */
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
