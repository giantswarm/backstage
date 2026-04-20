---
'@giantswarm/backstage-plugin-ai-chat-backend': patch
---

Strip stale `list_tools` / `list_core_tools` tool results from conversation history before they are resent to the model. The most recent result for each tool is kept intact; older occurrences are replaced with a short placeholder. A single `list_tools` call from a muster MCP server can cost ~20K tokens, and without compaction it was replayed on every subsequent turn.
