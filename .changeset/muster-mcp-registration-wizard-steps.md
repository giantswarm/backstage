---
'@giantswarm/backstage-plugin-muster': patch
---

Add the MCP server registration wizard's shell and its first two steps under
the Servers view (`/agent-platform/muster/servers/new` and `.../new/auth`),
built on the agent creation flow's conventions: sub-routes sharing one form
provider, "Step X of N" labels, deep-link guards back to step 1, and
validation surfaced on Continue.

- Details step: installation (the section's active instance), display name
  with auto-derived technical name, description, URL, and transport.
- Authentication step: one guided question about the backend — no
  authentication, sign in with your own account (showing muster's public OAuth
  callback URL to allowlist, with an issuer/scopes override for servers
  without RFC 9728 metadata), or Platform SSO (with the token-exposure warning
  and the new-audience restart caveat). Invalid auth combinations are
  structurally unreachable; dependent fields disable with an explanation.

Not user-reachable yet: the "Register server" entry point lands with the
review & register and verify steps.
