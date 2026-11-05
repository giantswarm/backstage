---
'@giantswarm/backstage-plugin-gs': minor
---

The installation name in the Deployments and Clusters tables and in the
workload details pane links to the installation's catalog page, wherever the
catalog has the installation's entity (a `Resource` of type `installation`).
Otherwise the name stays plain text. In the workload details pane the link now
shows the installation's name rather than its entity's title, and a `Resource`
of another type that shares the installation's name is no longer linked.
