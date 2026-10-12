---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Agent page: the agent's tools are a **Tools** tab between Sessions and Usage, at the same `…/<name>/tools` address, instead of a page below the agent reached through "See which tools" on the Overview's Connectors section, which is gone. The tab is shown for an agent with tools: one bound to the muster gateway, which is how it reaches connectors and Platform tools, that does not declare `preset:none`. For an agent without tools, `…/tools` lands on the Overview, keeping the query string as the retired `…/skills` does. On the Tools tab the breadcrumbs and document title read as on the other tabs.
