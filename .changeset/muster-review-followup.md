---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-muster-backend': minor
'@giantswarm/backstage-plugin-ai-chat-backend': patch
'@giantswarm/backstage-plugin-gs-node': minor
'app': patch
'backend': patch
---

Support muster MCP servers behind per-user auth (`authProvider` entries in
`aiChat.mcp`): the muster frontend now forwards the user's OAuth token to the
muster-backend proxy, which opens per-user MCP sessions. Previously such
servers were reported as unconfigured and the Workflows page failed with a
503.

Also addresses review feedback on the initial muster plugins: the shared MCP
client cache moved from ai-chat-backend to `@giantswarm/backstage-plugin-gs-node`
and is reused by muster-backend; config parsing no longer throws on unnamed
`aiChat.mcp` entries; muster-backend uses `@backstage/errors` classes instead
of a hand-rolled error middleware; query parameter validation rejects empty
and repeated values; execution fetch errors are surfaced in the UI instead of
being silently swallowed; duplicate workflow step ids no longer drop nodes
from the graph; and `formatDuration` is shared instead of copy-pasted.
