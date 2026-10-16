---
'@giantswarm/backstage-plugin-muster': minor
---

A connector, a tool and a workflow name their installation in the path:
`/customize/connectors/<installation>/<server>[/<tab>]`,
`…/<installation>/<server>/tools/<tool>` and
`/customize/workflows/<installation>/<name>[/<tab>]`, instead of
`?installation=`. A connector is edited at
`/customize/connectors/<installation>/<server>/edit[/auth|/verify]` rather
than through `new?edit=<name>`. Each page reads its resource on that
installation whatever the section's scope, and says so when it cannot read it
there instead of falling back to a same-named workflow elsewhere. An unknown
address under the Connectors or Workflows tab lands on its list.

The Connectors and Workflows tabs attach to the app's Customize page
(`page:app/agent-shell-customize`) instead of `page:agent-platform`; the
`page:muster/mcp-servers-redirect` page is gone, its old addresses redirecting
through the app. New exported routes: `editMcpServer`, `editMcpServerAuth`,
`editMcpServerVerify`; new export `withQuery`.
