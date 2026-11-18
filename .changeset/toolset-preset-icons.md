---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': minor
---

The Agents list's connector logos and the agent page's Connectors section show each preset the toolset names first, by its label, with muster's icon for it, or a generic preset icon when muster sends none or an unusable one. `ToolsetPreset` gains the optional `icon`.
