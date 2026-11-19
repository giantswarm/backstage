---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-gs-common': patch
---

Keep the Workflows list and the Your sessions "By agent" table within their cards. The Workflows list shows all seven columns on a wide screen; in a narrower card it shows four, with each workflow's category, source and tags under its name, and stacks the rows below that. It takes no room for Category or Tags when no workflow listed has one. The By agent table keeps every figure on the row at every width: in a narrower card the turns and the reported cost show under the agent, and below that each agent is a stacked row with its sessions, turns, tokens, cost and reported cost.

`useFittingColumns` passes `columnsFor` the layout, `'full'`, `'narrow'` or `'compact'` (was a boolean), and while compact returns the compact columns with its minimum widths, each overridable with the new `compactMinWidths` option. The fixture data set gives workflows a category, tags and GitOps provenance, and some agents a runtime that reports a cost.
