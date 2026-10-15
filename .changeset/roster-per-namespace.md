---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The Agents roster lists the Agents of the namespaces a person may read when
they may not list them cluster-wide: an installation that refuses the
cluster-wide list of Agents, Harnesses or RemoteMCPServers is read namespace by
namespace (`kagent` and agent-manager's agent namespaces), so a person with a
namespaced kagent RoleBinding sees their agents, with their Harness names and
toolsets, instead of "Could not read 1 environment" on the roster, a
connector's "Used by" and a model's agents. The fallback is shared with the New
agent wizard's ModelConfigs (`useNamespacedFallback`); a namespace that fails
for another reason than a refusal now leaves the installation unread, as a
failed cluster-wide list does.
