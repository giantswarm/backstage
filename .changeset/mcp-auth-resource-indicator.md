---
'@giantswarm/backstage-plugin-auth-backend-module-gs': patch
---

Add RFC 8707 resource indicator support to the MCP OAuth2 authenticator. When a `resource` option is configured on an `mcp-*` auth provider, it is sent in both the authorization request and every token request (including refresh grants), so the authorization server issues access tokens audience-bound to the target MCP server. This is required by the MCP authorization specification and by JWT-validating gateways in front of MCP servers (e.g. agentgateway), which reject tokens without the expected `aud` claim.

Example configuration:

```yaml
auth:
  providers:
    mcp-muster:
      production:
        clientId: ...
        authorizationUrl: ...
        tokenUrl: ...
        resource: https://muster.example.com/mcp
```
