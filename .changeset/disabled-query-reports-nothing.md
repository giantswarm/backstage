---
'@giantswarm/backstage-plugin-kubernetes-react': patch
---

A disabled `useResource` / `useResources` query no longer returns API
discovery errors, version incompatibilities or client-outdated states, and so
reports none to Sentry.

A disabled query still resolves its version from discovery cached by another
caller, which keeps its query key and data stable. It used to hand back that
cached result's incompatibilities too, so a card that disables its query for a
resource it knows is not there (the cluster About card for a managed control
plane) could still show a `KubeadmControlPlane` incompatibility banner.
