---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Agent Platform's tabs read **Sessions · Agents · Models · MCP Servers · Workflows · Usage**: the page orders its tabs itself, by a declared list, whatever order the plugins attach them in or a deployment's `app.extensions` names them. An agent's toolset links each tool to its page beneath the MCP server offering it (falling back to the servers list searched for the tool), and the gateway binding and the "Sign in to muster" note link to muster's MCP Servers tab. The `musterToolExplorer` external route is replaced by `musterServers` and `musterServerTool`.
