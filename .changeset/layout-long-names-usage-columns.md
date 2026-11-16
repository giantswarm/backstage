---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-ui-react': minor
---

Long names and narrow tables stay inside the page: the Usage tabs' By agent and By model tables show their phone columns wherever they are too narrow for all of them, as beside the side rail at tablet width, and long agent and Organization names end in an ellipsis on Home's recent agents, the Workspaces tab's Organization picker, the Used by tabs and the Usage overview's top agents. At phone width the New session composer's toolchains button has no caret, so the agent and workspace beside it keep room for their names. `useCompactLayout` says when a table is too narrow for its columns, measured on its container, and `usePhoneColumns` takes it (`{ compact }`).
