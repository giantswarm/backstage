---
'@giantswarm/backstage-plugin-flux-react': minor
'@giantswarm/backstage-plugin-flux': minor
---

Roll up failing descendant status in the Flux resources tree and add a "Failing only" status filter. Parent nodes now show a warning indicator when any resource beneath them has `Ready=False` (visible while collapsed), and the new Status filter prunes the tree to only the paths that lead to failing resources — the UI equivalent of `flux get kustomizations --status-selector ready=false`.
