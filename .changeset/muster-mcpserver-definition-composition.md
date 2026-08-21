---
'@giantswarm/backstage-plugin-muster': patch
---

Add the composition + validation core of the MCP server registration wizard:
`lib/mcpServerDefinition` turns wizard form state into the definition muster's
`core_mcpserver_*` tools take, and `NewMcpServerFormProvider` holds the
wizard's shared state.

The three auth choices map one-to-one onto muster's auth spec — no
authentication omits `auth`, "sign in with your own account" composes
`auth.type: oauth` with an optional issuer/scopes override, and Platform SSO
composes `auth.forwardToken: true` with optional required audiences. Validation
mirrors the CRD's rules and exposes the auth mutual exclusions as disabled
fields with explanations rather than submit-time errors; composed definitions
are tested against muster's real MCPServer CRD schema and its CEL rules.

Nothing user-visible yet: no route or UI reaches this code.
