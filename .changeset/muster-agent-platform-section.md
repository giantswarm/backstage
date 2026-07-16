---
'@giantswarm/backstage-plugin-muster': minor
---

Move the muster section under the Agent Platform page. Instead of a standalone
page, muster now contributes a `SubPageBlueprint` ("MCP Servers") attached to
`page:agent-platform`, mounted at `/agent-platform/muster`. Its four views
(Dashboard, Servers, Workflows, Tool explorer) render as a second-level BUI tab
row inside the section.

Tab URLs change accordingly:

- `/muster/*` → `/agent-platform/muster/*` (bare `/agent-platform/muster`
  redirects to `/agent-platform/muster/dashboard`).
- The "MCP servers" view is renamed to "Servers":
  `/agent-platform/muster/mcp-servers` → `/agent-platform/muster/servers`.
