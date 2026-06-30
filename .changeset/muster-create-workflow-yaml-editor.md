---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-muster': minor
---

Revamp the muster "Create workflow" / edit-ad-hoc-workflow modal and share its editor.

- The `YamlEditorFormField` wrapper now lives in (and is exported from) `@giantswarm/backstage-plugin-ui-react`, next to the `YamlEditor` it wraps, so it can be reused outside the `gs` plugin.
- The muster workflow modal now edits the definition as **YAML** (seeded via `yaml.dump`, parsed via `yaml.load`) using the shared `YamlEditorFormField` CodeMirror editor instead of a plain JSON textarea.
- Closing the modal is now an X in the title bar (the footer "Close" button is removed), the Save button uses the standard primary color, and validation output renders in a fixed-height region so the modal no longer resizes when a message appears.
