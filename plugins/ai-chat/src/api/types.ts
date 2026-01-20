import { createApiRef, OAuthApi } from '@backstage/core-plugin-api';

/**
 * MCP server information returned from configuration
 */
export interface McpServer {
  /** Unique name for this MCP server */
  name: string;
  /** Display name shown in UI */
  displayName: string;
  /** Whether OAuth is required for this server */
  requiresAuth: boolean;
  /** Provider ID for authentication */
  providerId: string;
}

/**
 * MCP OAuth session containing authentication tokens
 */
export interface McpOAuthSession {
  /** Access token for MCP server requests */
  accessToken: string;
  /** When the access token expires */
  expiresAt?: Date;
  /** Scopes granted in this session */
  scopes?: string[];
}

/**
 * API for managing MCP server authentication.
 *
 * This API provides methods to:
 * - List available MCP servers
 * - Get OAuth APIs for authenticated servers
 * - Trigger OAuth flows for server authentication
 * - Retrieve access tokens for MCP requests
 */
export interface MCPAuthApi {
  /**
   * Get list of available MCP servers from configuration.
   */
  getServers(): Promise<McpServer[]>;

  /**
   * Get the OAuth API for a specific MCP server.
   * Returns undefined if the server doesn't exist or doesn't require auth.
   */
  getAuthApi(serverName: string): OAuthApi | undefined;

  /**
   * Get an access token for the specified MCP server.
   * This will trigger the OAuth flow if the user is not authenticated.
   *
   * @param serverName - The name of the MCP server
   * @returns The access token string
   * @throws If authentication fails or is cancelled
   */
  getAccessToken(serverName: string): Promise<string>;

  /**
   * Check if the user is currently authenticated with an MCP server.
   *
   * @param serverName - The name of the MCP server
   * @returns True if authenticated, false otherwise
   */
  isAuthenticated(serverName: string): Promise<boolean>;

  /**
   * Sign out from an MCP server.
   *
   * @param serverName - The name of the MCP server
   */
  signOut(serverName: string): Promise<void>;
}

/**
 * API reference for the MCP Auth API.
 */
export const mcpAuthApiRef = createApiRef<MCPAuthApi>({
  id: 'plugin.ai-chat.mcp-auth',
});

/**
 * Options for creating the MCP Auth API.
 */
export interface MCPAuthApiCreateOptions {
  servers: McpServer[];
  authApis: Record<string, OAuthApi>;
}
