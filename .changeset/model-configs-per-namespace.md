---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The New agent wizard offers the ModelConfigs of the namespaces a person may
read when they may not list them cluster-wide: an installation that refuses
the cluster-wide list is read namespace by namespace (agent-manager's agent
namespaces, else `kagent`), so a person with a namespaced kagent RoleBinding
can pick a model and no longer sees "Couldn't read 1 installation".
