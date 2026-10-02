---
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs': patch
---

Relative links in a chart's README card, and in a SOUL card, now point to the
file in the source repository at the README's version, instead of to a
Backstage page that does not exist. `GSMarkdownContent`, `CollapsibleMarkdown`
and `CollapsibleMarkdownCard` take a new `sourceUrl` prop for this, and
`createMarkdownLinkResolver` is exported.
