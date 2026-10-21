---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Retry on "Couldn't load your agents" asks the controller again which namespaces
hold the person's agents, along with muster, so a failed answer from it no
longer outlasts the retry.
