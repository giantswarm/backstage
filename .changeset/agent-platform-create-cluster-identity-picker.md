---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Create cluster: the cloud identity is picked from the installation's `AWSClusterRoleIdentity` names whenever the provider line in effect is aws or eks, the preselected one included; it showed a free text field until a provider was chosen by hand.
