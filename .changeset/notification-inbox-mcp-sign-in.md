---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-analytics-react': patch
---

MCP servers that wait for the person's sign-in move from muster's corner card
into the Agent Platform shell's Notification inbox: one row for the person's
home installation, "2 MCP servers need your sign-in", naming the servers, with
a Sign in that opens muster's sign-in dialog in place. The row counts in the
bell's badge, the tab title, "Mark all read", the toasts and the desktop
notifications. A server that starts to wait makes it unread again; a sign-in,
in the dialog or on a muster page, takes it away. Marking the row read takes
the place of the card's "Not now".

`muster` no longer mounts its corner card (`McpAuthNotice`) on every page, and
exports `McpSignInProvider` and `useMcpSignIn`: the home installation's MCP
servers waiting for the person's sign-in, read every five minutes and when the
tab regains focus under muster's query client, and `openSignIn` for its
sign-in dialog. `useMcpServersAwaitingSignIn` also tells whether muster
answered (`isAvailable`).

`agent-platform`'s `SeenMarkReason` and `analytics-react`'s
`AgentPlatform.notificationOpened` take the `mcpSignIn` kind: the MCP sign-in
row's Sign in.
