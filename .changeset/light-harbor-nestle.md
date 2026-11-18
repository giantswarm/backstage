---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs-common': patch
---

Keep the Workflows list and the Your sessions "By agent" table within their cards: each column holds its header and usual value whole, a narrower card leaves out columns and shows their values under the name (category, source and tags for workflows; turns and the reported cost for agents), and a card too narrow for that stacks the rows or takes the compact columns. The Workflows list no longer scrolls sideways beside the side rail, and takes no room for Category or Tags when no workflow listed has one.

`useFittingColumns` passes `columnsFor` the layout, `'full'`, `'narrow'` or `'compact'` (was a boolean), and while compact returns the compact columns with its minimum widths, each overridable with the new `compactMinWidths` option. The fixture data set gives workflows a category, tags and GitOps provenance.
