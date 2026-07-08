---
'@giantswarm/backstage-plugin-kubernetes-react': minor
---

Add kagent `Agent` and `ModelConfig` resource classes.

- New `Agent` and `ModelConfig` classes wrap the kagent `v1alpha2` CRDs
  (`kagent.dev`), usable with `useResources` for listing/reading on management
  clusters. `ModelConfig` exposes `getModel`/`getProvider`/`getDisplayName` (the
  latter prefers a `ui.giantswarm.io/display-name` annotation, falling back to
  the resource name); `Agent` exposes
  `getDescription`/`getModelConfigName`/`getSystemMessage`/`getSkillRefs`.
- Bump `@giantswarm/k8s-types` to `v0.6.0`, which adds the kagent types.
- Remove the orphaned `AppDeployment`, `GitHubApp`, and `GitHubRepo` resource
  classes: `v0.6.0` dropped the Kratix-derived `giantswarm/v1beta1` types they
  wrapped (org-wide Kratix removal), and nothing referenced these classes.
