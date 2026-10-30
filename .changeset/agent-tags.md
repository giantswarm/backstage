---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-kubernetes-react': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Agents can carry tags (the `ui.giantswarm.io/tags` annotation). The agent wizard adds them where the installation's agent-manager reports the `tags` capability, suggesting tags other agents use and pointing out a near-duplicate of an existing one; the agent page shows them; Customize → Agents shows up to three on each row, in place of the model, skills and connectors, searches them and filters by them with a Tags dropdown. `Agent.getTags()` reads them. A `CatalogFacet` may now give an item several values, and every filter bar's option labels are cut with an ellipsis at 16rem, read whole on hover.
