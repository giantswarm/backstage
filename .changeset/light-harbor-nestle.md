---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-agent-platform': patch
---

Keep the Workflows list and the Your sessions "By agent" table within their cards: each column holds its header and usual value whole, a narrower card leaves out columns and names their values under the name (category and source for workflows, turns for agents), and a card too narrow for that stacks the rows. The Workflows list no longer scrolls sideways beside the side rail, and takes no room for Category or Tags when no workflow has one.
