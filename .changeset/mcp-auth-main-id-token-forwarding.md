---
'@giantswarm/backstage-plugin-ai-chat': minor
'@giantswarm/backstage-plugin-muster': minor
---

Forward the main Dex ID token as the MCP bearer token when an MCP server's `authProvider` has no dedicated `auth.providers` entry. `MCPAuthProviders` and `MusterAuthProviders` accept an optional main auth API (wired to `gsAuthProvidersApi.getMainAuthApi()` in the app) and fall back to its ID token, enabling single sign-on for muster via its trusted-audiences validation. Deployments enable this by removing the `mcp-muster` provider from `auth.providers`, which also removes the separate PKCE login from the user settings page; dedicated providers keep taking precedence while still configured.
