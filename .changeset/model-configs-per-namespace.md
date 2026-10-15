---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

The New agent wizard offers the ModelConfigs of the namespaces a person may
read when they may not list them cluster-wide: an installation that refuses
the cluster-wide list is read namespace by namespace (`kagent` and
agent-manager's agent namespaces), so a person with a namespaced kagent
RoleBinding can pick a model and no longer sees "Couldn't read 1
installation". A refused namespace is skipped; any other failure still reads
as "Could not read". `kubernetes-react` exports `getK8sListPath`.
