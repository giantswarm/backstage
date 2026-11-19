---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Tools step of New agent and Edit agent, and the organization page's Connectors tab, leave out an agent's muster binding by agent-manager's `musterBindingOf` (agent-manager 3.3.4 and later): a connector that another Helm chart renders is now offered and listed. With an older agent-manager, or one whose version is no release, both keep leaving out every Helm-rendered connector. The Connectors tab no longer lists the agents' muster bindings.
