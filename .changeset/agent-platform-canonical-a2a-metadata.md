---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

The session timeline and session usage read kagent's `kagent.dev/a2a/*` metadata (part type, usage, timeline position) and a delegated agent's `usage` response field, and still read the older `adk_`/`kagent_` spellings and `kagent.dev/timeline-position` in stored task history. The message a completed task's status carries is read as the task's last history entry, which is the only place the claude Harness reports its usage, so tool calls, tool results and token usage show again for ADK and Claude Code agents on kagent 1.1. History entries without a timeline position keep their place behind the entry before them. On kagent 1.1 model reasoning is no longer marked as such and replies carry no author, so reasoning renders as the agent's answer and subagent replies are not attributed. `readKagentMetadata` and `readKagentSubagentUsage` take an optional type guard, a usage spelling that counts no tokens no longer hides an older one that does, and `readKagentMetadataRecord`, `isRecord` and `asRecord` are exported.
