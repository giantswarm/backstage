---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Long names and narrow tables stay inside the page: the Usage tabs' By agent and By model tables show their phone columns wherever they are too narrow for all of them, as beside the side rail at tablet width, and long agent and Organization names end in an ellipsis on Home's recent agents, the Workspaces tab's Organization picker, the Used by tabs and the Usage overview's top agents. `usePhoneColumns` takes the table's measured width (`{ width }`), and `usePhoneTable` says when a table gets its phone columns.
