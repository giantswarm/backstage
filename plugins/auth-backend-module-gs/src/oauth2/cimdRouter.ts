import express from 'express';
import Router from 'express-promise-router';
import { LoggerService } from '@backstage/backend-plugin-api';

/**
 * Client ID Metadata Document as defined by the OAuth 2.0 specification.
 * See: https://www.rfc-editor.org/rfc/rfc7591.html
 */
interface ClientIdMetadataDocument {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
}

/**
 * Creates a router that serves Client ID Metadata Document (CIMD) for a specific MCP provider.
 *
 * MCP servers will fetch these documents during the authorization flow to
 * validate the client and retrieve redirect URIs.
 *
 * Endpoints served:
 * - GET /.well-known/oauth-client.json
 *
 * @param baseUrl - The backend base URL (e.g., https://backstage.example.com)
 * @param providerId - The provider ID (e.g., 'mcp-server-name')
 * @param options - Optional configuration options
 * @param options.displayName - Display name for the provider (defaults to providerId)
 * @param options.extraRedirectUris - Additional redirect URIs to include
 * @param logger - Optional logger service
 */
export function createCimdRouter(
  baseUrl: string,
  providerId: string,
  options?: {
    displayName?: string;
    extraRedirectUris?: string[];
  },
  logger?: LoggerService,
): express.Router {
  const router = Router();
  const clientName = options?.displayName ?? providerId;

  logger?.debug(`CIMD router initialized for provider: ${providerId}`);

  /**
   * Serve Client ID Metadata Document for MCP OAuth.
   *
   * The client_id is the URL of this endpoint itself, following the CIMD spec.
   * MCP servers fetch this document to validate the client during authorization.
   */
  router.get(
    `/${providerId}/.well-known/oauth-client.json`,
    (_req: express.Request, res: express.Response) => {
      // The client_id is the URL of this CIMD endpoint
      const clientId = `${baseUrl}/api/auth/${providerId}/.well-known/oauth-client.json`;

      // The redirect URI is the standard Backstage auth handler frame
      const redirectPath = `/api/auth/${providerId}/handler/frame`;

      // Start with base redirect URI (reflects environment via backend.baseUrl)
      const redirectUris = [`${baseUrl}${redirectPath}`];

      // Add any extra redirect URIs from config
      if (options?.extraRedirectUris) {
        redirectUris.push(...options.extraRedirectUris);
      }

      const cimd: ClientIdMetadataDocument = {
        client_id: clientId,
        client_name: `Backstage - ${clientName}`,
        redirect_uris: redirectUris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        // Public client - uses PKCE instead of client_secret
        token_endpoint_auth_method: 'none',
      };

      logger?.debug(`Serving CIMD for ${providerId}: ${JSON.stringify(cimd)}`);

      // Set cache headers - CIMD can be cached for a short time
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Type', 'application/json');
      res.json(cimd);
    },
  );

  return router;
}
