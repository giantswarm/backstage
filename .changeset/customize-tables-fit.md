---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-ui-react': patch
---

The Customize lists keep their headers and short values whole: Toolchains shows the newest version and a count ("0.6.1 · 4 older") and how long ago it came ("Latest 1 month ago"), and holds "Waiting for approval" whole; Workspaces holds "Last synchronization" and "Not synchronized yet" whole and stacks its rows wherever the content column is too narrow for its columns, beside the side rail too; Workflows holds Category and the runs ("123 runs · 30 seconds ago") on one line; Connectors holds its Sign-in labels and "3 of 42 tools match", keeps the connector's name whole and, in a narrower content column, leaves out Tags and Sign-in before it stacks its rows, and a connector's name or description that ends in an ellipsis shows in full on hover. `getRelativeDate` takes `{ strict: true }` for an age without "about" or "less than".
