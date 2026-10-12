---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Agent page: the agent's tools are a **Tools** tab between Sessions and Usage, at the same `…/<name>/tools` address, instead of a page below the agent reached through "See which tools" on the Overview's Connectors section, which is gone. The tab is shown for an agent bound to the muster gateway, which is how it reaches connectors and Platform tools; for an agent without the binding, `…/tools` lands on the Overview. On the Tools tab the breadcrumbs and document title read as on the other tabs.
