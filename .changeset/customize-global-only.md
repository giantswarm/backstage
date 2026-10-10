---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Customize is global-only: the Agents tab drops its Organization column (it showed the Kubernetes namespace), and the Agents and Models tabs drop the organization filter. `OrganizationSelect` and `ALL_ORGANIZATIONS` are no longer exported, and `CustomizeAgentsPanel` and `CustomizeModelsPanel` no longer take an `organization` prop.
