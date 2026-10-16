---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-plans': patch
---

`GSMarkdownContent` renders top-level ` ```mermaid ` blocks as SVG diagrams in
the theme's light or dark palette, so Hive > Knowledge shows a document's
diagrams instead of their source. A diagram that cannot be rendered shows its
source under a note saying why. The new `MermaidDiagram` export renders one
diagram on its own.
