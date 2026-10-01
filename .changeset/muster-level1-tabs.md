---
'@giantswarm/backstage-plugin-muster': minor
---

muster contributes two of the Agent Platform's level-1 tabs instead of one: **MCP Servers** at `/agent-platform/mcp-servers` (the servers table, a page per server and per tool, the registration wizard at `…/new`) and **Workflows** at `/agent-platform/workflows`. The second-level tab row (Servers · Workflows · Tool explorer) is gone, and with it the Tool explorer — a tool is inspected and run on its page beneath its server. Old `/agent-platform/muster/…` URLs are not redirected. A workflow's **Run** opens its `workflow_<name>` tool on muster's server page. The plugin's route ids `root` and `toolExplorer` are removed, and `mcpServers`/`workflows` are now the tabs' roots; the `agentPlatformUsage` external route is gone with the legacy usage redirect.
