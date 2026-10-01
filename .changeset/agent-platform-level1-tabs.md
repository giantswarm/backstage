---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Agent Platform's tabs read **Sessions · Agents · Models · MCP Servers · Workflows · Usage**: the Usage tab ships in the new `agentPlatformUsageModule`, which an app registers next to the plugin so Usage lands after muster's tabs. An agent's toolset links each tool to its page beneath the MCP server offering it (falling back to the servers list searched for the tool), and the gateway binding and the "Sign in to muster" note link to muster's MCP Servers tab. The `musterToolExplorer` external route is replaced by `musterServers` and `musterServerTool`.
