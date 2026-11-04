---
'@giantswarm/backstage-plugin-ui-react': minor
---

Add `FileView`, a read-only view of a file with its name, an optional path
and a copy button above the content (YAML in a read-only `YamlEditor`), moved
here from agent-platform with a story and a test. `CodeBlock` takes an optional
`maxHeight`: longer text scrolls inside the block, capped at two fifths of the
view on a phone, and while it overflows the block is a tab stop and a region
named by the new `aria-label` or `aria-labelledby`. `scrollToEnd` opens a
capped block at the end of its text.
