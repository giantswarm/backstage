---
'@giantswarm/backstage-plugin-muster': patch
---

The muster section reads MCPServers and Workflows in muster's namespace when a
person may not list them cluster-wide: a person with only the namespaced
`agent-platform:user` binding sees the MCPServers they may read, and an empty
Workflows list where they may read none, instead of "Errors when trying to
fetch resources" on every Customize page. A person who may list them
cluster-wide reads them as before.
