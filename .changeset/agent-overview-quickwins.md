---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Customize → Agents names each agent's creator on its row, "Platform" for an agent outside an organization without the `agent-platform.giantswarm.io/created-by` annotation and none for an organization's (as the agent page's Created by now does too), and sorts by Last used (the person's own sessions; the default from the visit after they first use an agent, and never reordering the rows during a visit), Recently added or Name, remembered per browser.
