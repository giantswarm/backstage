/**
 * Muster's public OAuth callback URL for an installation — the redirect URI a
 * backend's authorization server must allowlist before "Sign in with your own
 * account" can work against it.
 *
 * Derived from the installation's aggregator MCP endpoint (`/installations`
 * reports `<publicUrl>/mcp`): muster registers its downstream OAuth callback at
 * `<publicUrl>/oauth/callback` (internal/config/defaults.go
 * DefaultOAuthCallbackPath, joined onto PublicURL in internal/oauth/client.go).
 */
export function musterOAuthCallbackUrl(
  endpoint: string | undefined,
): string | undefined {
  if (!endpoint) {
    return undefined;
  }
  let base: URL;
  try {
    base = new URL(endpoint);
  } catch {
    return undefined;
  }
  const path = base.pathname.replace(/\/+$/, '');
  base.pathname = path.endsWith('/mcp') ? path.slice(0, -'/mcp'.length) : path;
  base.search = '';
  base.hash = '';
  return `${base.toString().replace(/\/+$/, '')}/oauth/callback`;
}
