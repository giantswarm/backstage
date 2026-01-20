/**
 * Backend module for MCP OAuth 2.1 authentication with CIMD support.
 *
 * @packageDocumentation
 */

export { authModuleMcpProviders as default } from './module';
export { authModuleMcpProviders } from './module';
export { createMcpOAuthAuthenticator } from './authenticator';
export { createCimdRouter } from './cimdRouter';
export type {
  McpOAuthContext,
  McpOAuthSession,
  McpProfile,
  McpServerConfig,
  OAuthServerMetadata,
  ClientIdMetadataDocument,
} from './types';
