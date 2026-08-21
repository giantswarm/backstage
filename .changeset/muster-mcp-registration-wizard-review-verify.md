---
'@giantswarm/backstage-plugin-muster-backend': patch
'@giantswarm/backstage-plugin-muster': patch
---

Complete the MCP server registration wizard with its Review & register and
Verify steps, and make it reachable: "Register server" is now the primary
action in the MCP Servers page header (agent-flow convention), ahead of the
raw-JSON ad-hoc dialog.

- Review & register: summary strip, the full generated server definition, and
  a collapsed manual fallback (MCPServer manifest + `muster create mcpserver`
  command). Registration runs muster's existing `core_mcpserver_validate`
  (dry-run) then `core_mcpserver_create` over the per-user MCP session — the
  same live write path the raw-JSON dialog and the CLI use; no second write
  path.
- Verify: a live status panel, not a gate — the CR already exists, so nothing
  blocks and there is no timeout. `Auth Required` is treated as a normal state
  with the downstream sign-in offered inline; failures surface muster's status
  message and the CRD's retry/backoff info; after discovery the tool list
  links into the tool explorer. Leaving mid-verify is safe and the step says
  so.
- "Edit details" loops back to step 1 with the form intact and saves as an
  update to the same CR (the technical name locks once registered) — never a
  delete-and-recreate.
- Registered-by attribution from muster's `registeredBy` field (stamped
  server-side, muster#1021) is shown on the verify step and the server detail
  view's live runtime block.
- The muster-backend now takes `core_auth_login`'s sign-in URL from the MCP
  `structuredContent.authUrl` field (muster#1019) instead of scanning the
  prose for a URL line; the format-coupled prose parser is retired.
