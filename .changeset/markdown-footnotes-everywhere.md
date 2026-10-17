---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs': patch
---

A footnote reference in a template's description, a scaffolder step's note and
an installation's non-standard access docs jumps to its footnote: they render
through `GSMarkdownContent`. `GSMarkdownContent` takes a `linkTarget`, the
target of links out of the document; a footnote's links stay in the page.
