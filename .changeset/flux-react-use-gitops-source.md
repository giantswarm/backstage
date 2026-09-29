---
'@giantswarm/backstage-plugin-flux-react': minor
---

New `useGitOpsSource(resource, installationName)` hook. It resolves a reconciled resource to its Git source (resource → HelmRelease → Kustomization → GitRepository). It also follows a HelmRelease that an umbrella chart rendered, one level further up. It returns the source link, the Kustomization, for a chart-rendered resource the outermost HelmRelease, and what the Git host calls a proposed change (`changeRequestTerm`: "merge request" for a GitLab host, "pull request" otherwise, also exported as `ChangeRequestTerm`). Lookup errors are returned to the caller, not reported. `GitOpsCard` is now built on it. It gains the extra level too, so a resource rendered by a nested HelmRelease now shows its source instead of nothing.
