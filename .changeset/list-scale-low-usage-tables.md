---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-muster': patch
---

The Usage page's remaining tables stay plain at a few entries and bounded at
hundreds:

- The conversations by-agent table, Cost's by-model table and the MCP usage
  connectors table render their first 15 rows (by the active sort), with
  _Show all N_.
- The top tools and top connectors tables say what their top-10 cap left out
  ("and 14 more, 230 calls between them.") instead of dropping it silently.
  The `session-usage` route now returns `otherTools` and `otherMcpServers`
  (`{ count, calls }`) beside the capped lists.
