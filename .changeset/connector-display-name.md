---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': minor
---

Connectors (muster MCP servers) are named by the `ui.giantswarm.io/display-name`
annotation on their MCPServer where it is set, as agents and models are: in
the Connectors list, a connector's page title, breadcrumbs and document
title, the tool page's breadcrumb, the connector wizard's edit frame, the
command palette, the agent wizard's Tools step and review, the agent page's
tools, Usage → Connectors, the session timeline, the workflow pages and the
sign-in notice and dialogs. A family takes the display name its members agree
on, and connectors that would read the same go by their technical names, so no
two read alike (`connectorDisplayNames`, exported with
`mcpServerDisplayNames` and `connectorNameSource`). Searches match the display name and the technical name; URLs,
`server:` selectors and tool names keep the technical name, which the
connector's Technical details still show. `MCPServer` gains
`getDisplayNameAnnotation()` and `getDisplayName()`.
