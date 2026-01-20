import crypto from 'crypto';
import fetch from 'node-fetch';
import { Config } from '@backstage/config';
import {
  createOAuthAuthenticator,
  OAuthAuthenticatorResult,
  OAuthSession,
  decodeOAuthState,
} from '@backstage/plugin-auth-node';
import {
  McpOAuthContext,
  McpProfile,
  OAuthServerMetadata,
  PKCEParams,
  TokenResponse,
  MCP_PROVIDER_PREFIX,
} from './types';

const PKCE_COOKIE_NAME = 'mcp-pkce-verifier';

/**
 * Generate PKCE code verifier and challenge.
 * Per OAuth 2.1 spec, PKCE is required for public clients.
 */
function generatePKCE(): PKCEParams {
  // Generate a random 32-byte code verifier
  const codeVerifier = crypto.randomBytes(32).toString('base64url');

  // Create SHA256 hash of verifier for challenge
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * Discover OAuth 2.0 Authorization Server Metadata from MCP server.
 * Follows RFC 8414 for metadata discovery.
 */
async function discoverOAuthMetadata(
  mcpUrl: string,
): Promise<OAuthServerMetadata> {
  const url = new URL(mcpUrl);
  const baseUrl = `${url.protocol}//${url.host}`;

  // Try standard well-known endpoint first
  const metadataUrl = `${baseUrl}/.well-known/oauth-authorization-server`;

  try {
    const response = await fetch(metadataUrl);

    if (response.ok) {
      return (await response.json()) as OAuthServerMetadata;
    }
  } catch {
    // Fall through to defaults
  }

  // Fall back to MCP spec default endpoints
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
  };
}

/**
 * Exchange authorization code for tokens.
 */
async function exchangeCodeForTokens(
  tokenEndpoint: string,
  params: {
    code: string;
    clientId: string;
    codeVerifier: string;
    redirectUri: string;
    clientSecret?: string;
  },
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.clientId,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });

  // Add client_secret for confidential clients
  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret);
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Refresh access token using refresh token.
 */
async function refreshAccessToken(
  tokenEndpoint: string,
  params: {
    refreshToken: string;
    clientId: string;
    clientSecret?: string;
    scope?: string;
  },
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: params.clientId,
    refresh_token: params.refreshToken,
  });

  if (params.scope) {
    body.set('scope', params.scope);
  }

  if (params.clientSecret) {
    body.set('client_secret', params.clientSecret);
  }

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Token refresh failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return (await response.json()) as TokenResponse;
}

/**
 * Create an OAuth authenticator factory for a specific MCP server.
 *
 * This follows the MCP OAuth 2.1 specification with CIMD (Client ID Metadata Documents).
 * The client_id is a URL pointing to Backstage's CIMD endpoint.
 *
 * @param providerId - The auth provider ID (e.g., 'mcp-kubernetes-gazelle')
 * @param providerConfig - The environment-specific provider config from auth.providers
 * @param backendBaseUrl - The backend base URL for constructing CIMD URLs
 */
export function createMcpOAuthAuthenticator(
  providerId: string,
  providerConfig: Config,
  backendBaseUrl: string,
) {
  // Extract server name from provider ID (remove mcp- prefix)
  const serverName = providerId.replace(MCP_PROVIDER_PREFIX, '');
  const serverUrl = providerConfig.getString('serverUrl');
  const configuredClientId = providerConfig.getOptionalString('clientId');
  const clientSecret = providerConfig.getOptionalString('clientSecret');
  const scopes = providerConfig.getOptionalStringArray('scopes') ?? [];

  // Public client if no client_secret is configured
  const isPublicClient = !clientSecret;

  return createOAuthAuthenticator<McpOAuthContext, McpProfile>({
    defaultProfileTransform: async (
      result: OAuthAuthenticatorResult<McpProfile>,
    ) => {
      return {
        profile: {
          displayName: result.fullProfile.name ?? 'MCP User',
          email: result.fullProfile.email,
        },
      };
    },

    scopes: {
      persist: true,
      required: scopes,
    },

    initialize: ({ callbackUrl, config }): McpOAuthContext => {
      // Get backend base URL from config if not already set
      const baseUrl = backendBaseUrl || config.getString('backend.baseUrl');

      const clientId =
        configuredClientId ??
        `${baseUrl}/.well-known/oauth-client/${providerId}`;

      // Note: metadata will be populated lazily during start()
      return {
        metadata: {} as OAuthServerMetadata,
        clientId,
        callbackUrl,
        scopes,
        serverName,
        serverUrl,
        isPublicClient,
        clientSecret,
      };
    },

    start: async (input, ctx) => {
      // Discover OAuth metadata if not already done
      if (!ctx.metadata.authorization_endpoint) {
        const metadata = await discoverOAuthMetadata(ctx.serverUrl);
        Object.assign(ctx.metadata, metadata);
      }

      // Generate PKCE challenge (required for public clients per MCP spec)
      const pkce = generatePKCE();

      // Store code verifier in cookie for later retrieval
      // The cookie is tied to the state nonce
      const state = decodeOAuthState(input.state);

      // Set PKCE verifier cookie
      const cookieName = `${PKCE_COOKIE_NAME}-${state.nonce}`;
      const res = (input.req as any).res;
      if (res && res.cookie) {
        res.cookie(cookieName, pkce.codeVerifier, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 10 * 60 * 1000, // 10 minutes
          path: '/',
        });
      }

      // Build authorization URL
      const authUrl = new URL(ctx.metadata.authorization_endpoint);
      authUrl.searchParams.set('client_id', ctx.clientId);
      authUrl.searchParams.set('redirect_uri', ctx.callbackUrl);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', input.state);
      authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
      authUrl.searchParams.set(
        'code_challenge_method',
        pkce.codeChallengeMethod,
      );

      // Add scopes
      const scopeString =
        input.scope ||
        (ctx.scopes.length > 0 ? ctx.scopes.join(' ') : undefined);
      if (scopeString) {
        authUrl.searchParams.set('scope', scopeString);
      }

      return { url: authUrl.toString() };
    },

    authenticate: async (input, ctx) => {
      // Ensure metadata is loaded
      if (!ctx.metadata.token_endpoint) {
        const metadata = await discoverOAuthMetadata(ctx.serverUrl);
        Object.assign(ctx.metadata, metadata);
      }

      // Extract authorization code from callback
      const url = new URL(input.req.url, 'http://localhost');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (!code) {
        throw new Error('Missing authorization code in callback');
      }

      if (!state) {
        throw new Error('Missing state in callback');
      }

      // Get PKCE verifier from cookie
      const decodedState = decodeOAuthState(state);
      const cookieName = `${PKCE_COOKIE_NAME}-${decodedState.nonce}`;
      const cookies = (input.req as any).cookies || {};
      const codeVerifier = cookies[cookieName];

      if (!codeVerifier) {
        throw new Error(
          'Missing PKCE code verifier - OAuth flow may have expired',
        );
      }

      // Clear the PKCE cookie
      const res = (input.req as any).res;
      if (res && res.clearCookie) {
        res.clearCookie(cookieName, { path: '/' });
      }

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(ctx.metadata.token_endpoint, {
        code,
        clientId: ctx.clientId,
        codeVerifier,
        redirectUri: ctx.callbackUrl,
        clientSecret: ctx.clientSecret,
      });

      // Build session
      const session: OAuthSession = {
        accessToken: tokens.access_token,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope ?? ctx.scopes.join(' '),
        refreshToken: tokens.refresh_token,
        expiresInSeconds: tokens.expires_in,
        idToken: tokens.id_token,
      };

      // Build profile from token claims (if available)
      // MCP servers typically return minimal profile info
      const profile: McpProfile = {
        sub: undefined,
        email: undefined,
        name: undefined,
      };

      // Try to decode ID token for profile info if present
      if (tokens.id_token) {
        try {
          const [, payload] = tokens.id_token.split('.');
          const claims = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8'),
          );
          profile.sub = claims.sub;
          profile.email = claims.email;
          profile.name = claims.name;
        } catch {
          // Ignore decode errors
        }
      }

      return {
        fullProfile: profile,
        session,
      };
    },

    refresh: async (input, ctx) => {
      // Ensure metadata is loaded
      if (!ctx.metadata.token_endpoint) {
        const metadata = await discoverOAuthMetadata(ctx.serverUrl);
        Object.assign(ctx.metadata, metadata);
      }

      const tokens = await refreshAccessToken(ctx.metadata.token_endpoint, {
        refreshToken: input.refreshToken,
        clientId: ctx.clientId,
        clientSecret: ctx.clientSecret,
        scope: input.scope,
      });

      const session: OAuthSession = {
        accessToken: tokens.access_token,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope ?? input.scope,
        refreshToken: tokens.refresh_token ?? input.refreshToken,
        expiresInSeconds: tokens.expires_in,
        idToken: tokens.id_token,
      };

      // Build profile from token claims (if available)
      const profile: McpProfile = {
        sub: undefined,
        email: undefined,
        name: undefined,
      };

      if (tokens.id_token) {
        try {
          const [, payload] = tokens.id_token.split('.');
          const claims = JSON.parse(
            Buffer.from(payload, 'base64url').toString('utf8'),
          );
          profile.sub = claims.sub;
          profile.email = claims.email;
          profile.name = claims.name;
        } catch {
          // Ignore decode errors
        }
      }

      return {
        fullProfile: profile,
        session,
      };
    },
  });
}
