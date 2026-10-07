---
'@giantswarm/backstage-plugin-ui-react': minor
---

Add `ManifestDialog`: a controlled dialog that shows a manifest as syntax-highlighted, read-only YAML (the read-only `YamlEditorFormField`), with a **Copy manifest** button that confirms with "Copied". Add `useCopyWithFeedback`, the copy-and-confirm logic `CopyButton` and `ManifestDialog` share. `YamlEditorFormField` now gives the editor its `label` as accessible name.
