---
'@giantswarm/backstage-plugin-ui-react': minor
---

Add `FileView`, a read-only view of a file with its name, an optional path
and a copy button above the content (YAML in a read-only `YamlEditor`), moved
here from agent-platform with a story and a test. `CodeBlock` takes an optional
`maxHeight`: longer text scrolls inside the block, which then takes keyboard
focus.
