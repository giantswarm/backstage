---
'@giantswarm/backstage-plugin-agent-platform': patch
---

The workspace-manager client follows the provider sign-in's move to muster (workspace-manager 0.10): `authorize_workspace`'s `connect[]` entries and `list_providers`' providers carry `signIn`, a sentence saying how the person grants the provider's App in muster, in place of `url` and `connectURL`. `connectProvider` and `disconnectProvider` are gone with the manager's `connect_provider` and `disconnect_provider`.
