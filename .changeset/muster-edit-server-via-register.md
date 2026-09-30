---
'@giantswarm/backstage-plugin-muster': minor
---

Edit a manually-added MCP server through the "Register an MCP server" wizard,
pre-filled with the server, instead of the raw-JSON dialog.

The Edit button on a manually-added server opens the wizard at
`servers/new?edit=<name>`, so an edit survives a reload and can be linked to.
It is filled in with the server's URL, transport, authentication and request
metadata; the technical name is locked (the display name, which only derives
it, is hidden) and saving runs `core_mcpserver_update` on the same server.
Fields the wizard has no control for (`headers`, `env`, `toolPrefix`,
`timeout`, `autoStart`, ...) are carried over from the server, a cleared auth
answer or metadata list is sent explicitly so muster does not keep the old one,
and `suspended` is left untouched. Switching back to the server's own auth
answer brings its values back. The wizard says "Edit MCP server: <name>" /
"Review and save" while editing, and the verify step holds its verdict
("Applying changes…") until muster has reconciled the saved spec.

The edit stays on the installation the server lives on: switching the header's
installation mid-edit ends the edit and returns to the server list. An
unfinished new registration is set aside while editing and comes back
afterwards.

Servers the wizard cannot represent — `stdio` servers, and servers using token
exchange, local token minting or other auth settings it has no field for —
keep an "Edit as JSON" button that opens the JSON editor, with a tooltip that
says why. GitOps-managed servers are unchanged ("Edit/Remove"). Disabled
row actions are now focusable and name the reason they are unavailable, for
keyboard and screen-reader users.
