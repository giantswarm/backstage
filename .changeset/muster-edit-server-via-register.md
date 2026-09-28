---
'@giantswarm/backstage-plugin-muster': minor
---

Edit a manually-added MCP server through the "Register an MCP server" wizard,
pre-filled with the server, instead of the raw-JSON dialog.

The Edit button on a manually-added server now opens the wizard at step 1 with
its URL, transport, authentication and request metadata filled in. The
technical name is locked and saving runs `core_mcpserver_update` on the same
server. Fields the wizard has no control for (`headers`, `env`, `toolPrefix`,
`timeout`, `autoStart`, and `tokenExchange`/`localMint` while the auth mode is
unchanged) are carried over from the existing server, so an edit never drops
them. The wizard says "Edit MCP server" / "Review and save" while editing, and
"Register server" always starts a new registration from an empty form.

`stdio` servers, which the wizard does not cover, keep a disabled Edit button
that explains why. GitOps-managed servers are unchanged ("Edit via GitOps").
