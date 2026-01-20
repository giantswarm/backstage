/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414)
 */
export interface OAuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  response_modes_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
  revocation_endpoint?: string;
  revocation_endpoint_auth_methods_supported?: string[];
  introspection_endpoint?: string;
  introspection_endpoint_auth_methods_supported?: string[];
}

/**
 * Client ID Metadata Document (CIMD) for MCP OAuth
 */
export interface ClientIdMetadataDocument {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: string;
  scope?: string;
  contacts?: string[];
  logo_uri?: string;
  client_uri?: string;
  policy_uri?: string;
  tos_uri?: string;
}

/**
 * MCP OAuth session data
 */
export interface McpOAuthSession {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes?: string[];
  serverName: string;
}

/**
 * Profile information from MCP OAuth
 */
export interface McpProfile {
  sub?: string;
  email?: string;
  name?: string;
}

/**
 * MCP server configuration
 */
export interface McpServerConfig {
  name: string;
  url: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[];
  displayName?: string;
}

/**
 * OAuth context used during authentication flow
 */
export interface McpOAuthContext {
  metadata: OAuthServerMetadata;
  clientId: string;
  callbackUrl: string;
  scopes: string[];
  serverName: string;
  serverUrl: string;
  isPublicClient: boolean;
  clientSecret?: string;
}

/**
 * Token response from MCP OAuth server
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/**
 * PKCE parameters for OAuth flow
 */
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export const MCP_PROVIDER_PREFIX = 'mcp-';
