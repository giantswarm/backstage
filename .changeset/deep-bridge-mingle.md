---
'@giantswarm/backstage-plugin-gs': minor
---

Add multi-source value editing for app deployment scaffolder templates:

- New `GSValueSourcesEditor` field extension: edit multiple `valuesFrom` sources (ConfigMaps/Secrets) with per-source YAML editors, name validation, drag-to-reorder, and merged Helm schema validation
- New `MultiSourceDeploymentPicker` variant: populates editors from existing HelmRelease `valuesFrom` entries in edit mode
- Warn when an app deployment is managed through GitOps (read-only notice)
- Pass `valuesMode` via URL formData so edit templates can distinguish single- vs multi-source flows
