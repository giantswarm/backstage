---
'@giantswarm/backstage-plugin-muster': minor
---

MCP servers are called **Connectors** everywhere people see them: the Agent
Platform tab, page titles, breadcrumbs, table headers, empty states, dialogs
and wizard copy. The tab moved from `/agent-platform/mcp-servers` to
`/agent-platform/connectors`; the old address redirects with its path and
query intact (enable `page:muster/mcp-servers-redirect` alongside
`page:agent-platform`). Code identifiers, the `MCPServer` CRD and the
`Muster.mcpServerAdded` telemetry event keep their names, and "MCP server"
remains where it names the remote server itself.
