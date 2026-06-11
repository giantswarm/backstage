---
'@giantswarm/backstage-plugin-ai-chat': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

Fix the muster Workflows page failing with 401 ("requires a user token for
auth provider ... but the request did not include one") when the muster MCP
server uses per-user auth.

The muster frontend resolves the server's `authProvider` by matching the
`aiChat.mcp` entry by `name`, but `name` was not declared frontend-visible in
the config schema, so the browser never saw it, never resolved the auth
provider, and never sent the auth header. `aiChat.mcp[].name` is now
`@visibility frontend`, and `muster.serverName` is declared frontend-visible
in the muster frontend plugin's own config schema so overriding the entry
name also works in the browser.
