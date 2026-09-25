---
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

The session timeline reads kagent's `kagent.dev/a2a/*` metadata (part type, usage, timeline position) and a delegated agent's `usage` response field, and still reads the older `adk_`/`kagent_` spellings and `kagent.dev/timeline-position` in stored task history. Tool calls, tool results and token usage show again for agents on kagent 1.1, whichever runtime they use.
