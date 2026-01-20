import express from 'express';
import Router from 'express-promise-router';
import { Config } from '@backstage/config';
import { LoggerService } from '@backstage/backend-plugin-api';
import { ClientIdMetadataDocument, MCP_PROVIDER_PREFIX } from './types';

export interface CimdRouterOptions {
  config: Config;
  logger: LoggerService;
}

interface McpProviderConfig {
  providerId: string;
  displayName: string;
}

/**
 * Creates a router that serves Client ID Metadata Documents (CIMD) for MCP OAuth.
 *
 * MCP servers will fetch these documents during the authorization flow to
 * validate the client and retrieve redirect URIs.
 *
 * Endpoints served:
 * - GET /.well-known/oauth-client/mcp-{server-name}
 */
export function createCimdRouter(options: CimdRouterOptions): express.Router {
  const { config, logger } = options;

  const router = Router();
  const baseUrl = config.getString('backend.baseUrl');

  // Read MCP providers from auth.providers config
  const providersConfig = config.getOptionalConfig('auth.providers');
  const environment =
    config.getOptionalString('auth.environment') ?? 'development';

  const allProviders = providersConfig?.keys() ?? [];
  const mcpProviderIds = allProviders.filter(p =>
    p.startsWith(MCP_PROVIDER_PREFIX),
  );

  // Build a map of provider configs for CIMD serving
  const mcpProviderConfigs = new Map<string, McpProviderConfig>();
  for (const providerId of mcpProviderIds) {
    const providerConfig = providersConfig
      ?.getConfig(providerId)
      ?.getOptionalConfig(environment);

    if (providerConfig) {
      mcpProviderConfigs.set(providerId, {
        providerId,
        displayName:
          providerConfig.getOptionalString('displayName') ?? providerId,
      });
    }
  }

  logger.info(
    `CIMD router initialized for ${mcpProviderConfigs.size} MCP server(s)`,
  );

  /**
   * Serve Client ID Metadata Document for MCP OAuth.
   *
   * The client_id is the URL of this endpoint itself, following the CIMD spec.
   * MCP servers fetch this document to validate the client during authorization.
   */
  router.get(
    '/:providerId/.well-known/oauth-client.json',
    (req: express.Request, res: express.Response) => {
      const { providerId } = req.params;

      // Only serve CIMD for MCP providers
      if (!providerId.startsWith(MCP_PROVIDER_PREFIX)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      // Verify provider is configured
      const providerConfig = mcpProviderConfigs.get(providerId);
      if (!providerConfig) {
        logger.warn(`CIMD request for unknown MCP provider: ${providerId}`);
        res.status(404).json({ error: 'MCP provider not configured' });
        return;
      }

      const { displayName } = providerConfig;

      // The client_id is the URL of this CIMD endpoint
      const clientId = `${baseUrl}/api/auth/${providerId}/.well-known/oauth-client.json`;

      // The redirect URI is the standard Backstage auth handler frame
      const redirectPath = `/api/auth/${providerId}/handler/frame`;

      const cimd: ClientIdMetadataDocument = {
        client_id: clientId,
        client_name: `Backstage - ${displayName}`,
        redirect_uris: [
          `${baseUrl}${redirectPath}`,
          `http://localhost:7007${redirectPath}`,
          `https://localhost:7007${redirectPath}`,
        ],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        // Public client - uses PKCE instead of client_secret
        token_endpoint_auth_method: 'none',
      };

      logger.debug(`Serving CIMD for ${providerId}: ${JSON.stringify(cimd)}`);

      // Set cache headers - CIMD can be cached for a short time
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.setHeader('Content-Type', 'application/json');
      res.json(cimd);
    },
  );

  return router;
}
