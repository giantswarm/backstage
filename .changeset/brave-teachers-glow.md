---
'@giantswarm/backstage-plugin-auth-backend-module-gs': minor
'@giantswarm/backstage-plugin-ai-chat': minor
'@giantswarm/backstage-plugin-gs': minor
---

Add OAuth2 PKCE authentication support for MCP servers

- Add custom OAuth2 authenticator with PKCE (Proof Key for Code Exchange) support for secure public client authentication
- Add CIMD (Client ID Metadata Document) router to serve OAuth client metadata for MCP server authorization flows
- Register MCP auth providers (prefixed with `mcp-`) in the backend auth module
- Add `MCPAuthProviders` API in ai-chat plugin to fetch credentials for configured MCP auth providers
- Update AI Chat page to automatically inject MCP auth tokens into request headers
- Refactor `GSAuthProviders` to separate Kubernetes and MCP auth providers with dedicated methods
