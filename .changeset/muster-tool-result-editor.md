---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Tool Explorer: a tool's result is shown in the read-only editor (the one the
Workflow manifest dialog uses) with JSON highlighting and folding, and the
Table, Parsed and Raw views grow with the window instead of stopping at 480 px.
`YamlEditor` and `YamlEditorFormField` take a `language` prop (`'yaml'` by
default, or `'json'`), and `YamlEditorFormField`'s `maxHeight` accepts a CSS
length. A read-only editor no longer opens with a bracket highlighted, and long
documents get fold markers on their outer levels.
