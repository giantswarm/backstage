---
'@giantswarm/backstage-plugin-ui-react': patch
'@giantswarm/backstage-plugin-gs': patch
---

Markdown rendered with `GSMarkdownContent` (README and SOUL cards, plans,
workflow descriptions): a `#heading` link now jumps to its heading within the
document. Headings are matched by their GitHub slug, so `#valuesyaml` finds
`## values.yaml`, and footnotes, ids in raw HTML, `#` and `#top` work as on
GitHub. A collapsed README or SOUL card expands when the target is past the
cut.
