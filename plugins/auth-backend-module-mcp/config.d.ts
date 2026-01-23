/**
 * Configuration for MCP OAuth providers.
 *
 * MCP providers are configured under auth.providers with the 'mcp-' prefix.
 * Each provider follows the standard Backstage auth provider pattern with
 * environment-specific configuration.
 *
 * Example:
 * ```yaml
 * auth:
 *   environment: development
 *   providers:
 *     mcp-kubernetes-graveler:
 *       development:
 *         serverUrl: https://mcp-kubernetes.graveler.gaws2.gigantic.io
 *         displayName: Kubernetes MCP - graveler
 *         scopes:
 *           - kubernetes:read
 *           - kubernetes:write
 *         # Optional: for pre-registered clients
 *         clientId: ${MCP_CLIENT_ID}
 *         clientSecret: ${MCP_CLIENT_SECRET}
 * ```
 */
export interface Config {
  auth?: {
    providers?: {
      /**
       * MCP providers use 'mcp-*' prefix in their provider ID.
       * The provider ID determines the auth endpoint: /api/auth/mcp-{name}
       * The CIMD endpoint: /.well-known/oauth-client/mcp-{name}
       */
      [key: string]: {
        [environment: string]: {
          /**
           * Base URL of the MCP server (required)
           * OAuth metadata is discovered from this URL
           */
          serverUrl?: string;
          /**
           * Display name shown in the UI (optional)
           * Defaults to the provider ID
           */
          displayName?: string;
          /**
           * OAuth scopes to request (optional)
           */
          scopes?: string[];
          /**
           * Pre-registered client ID (optional)
           * If not provided, uses CIMD URL as client_id
           */
          clientId?: string;
          /**
           * Client secret for confidential clients (optional)
           * @visibility secret
           */
          clientSecret?: string;
        };
      };
    };
  };
}
