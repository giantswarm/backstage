---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-roadmap': patch
---

Render authored Markdown in the muster and roadmap pages with the shared
`GSMarkdownContent` component from `@giantswarm/backstage-plugin-ui-react`
instead of calling `MarkdownContent` directly. This gives the muster workflow
description and the roadmap item body/comments the same consistent paragraph,
list, and code-block typography as the Plans page, and drops muster's
now-redundant local paragraph-styling workaround.
