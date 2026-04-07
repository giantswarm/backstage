---
'@giantswarm/backstage-plugin-gs': minor
---

Add multi-source value editing for scaffolder deployments. Introduces `ValueSourcesEditor` field extension for editing multiple `valuesFrom` sources (ConfigMaps/Secrets) with per-source YAML editors, name validation, reordering, and merged Helm schema validation. Adds `MultiSourceDeploymentPicker` that fetches HelmRelease `valuesFrom` entries and resolves ConfigMap/Secret data for edit mode. Extracts `useHelmValuesValidation` hook and `helmMerge` utility for reuse. Adds `useAlignWithAnchor` hook for dynamic ConfigurationDocs sidebar alignment. Updates `EditDeploymentButton` to pass `valuesMode` via URL formData.
