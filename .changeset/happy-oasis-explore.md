---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Populate `agent.iconUrl` in the composed agent manifest at creation time, so the
created Agent's `spec.iconUrl` (surfaced on the A2A AgentCard) matches the avatar
Backstage renders.

- The review/deploy page now sets `agent.iconUrl` in the HelmRelease values to
  the size-agnostic canonical avatar URL
  (`https://avatars.<baseDomain>/v1/<name>.png`), derived from the agent's
  technical name via the same `useAgentAvatarUrl` builder used for display.
- The field is omitted when the installation has no configured base domain, so
  the chart keeps its default rather than persisting an empty URL.
