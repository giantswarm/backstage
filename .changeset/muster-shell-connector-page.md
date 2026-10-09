---
'@giantswarm/backstage-plugin-muster': minor
---

Inside the agent-platform shell (flag `agent-platform-shell`), a server's page is a connector page: breadcrumbs under Customize, the connector's state, Edit and a menu to reconnect, sign out, turn off or remove it; Tools with a search, a Reads / Changes things filter and an inline Try it; Settings to change the address and sign-in of a server added through the portal (read-only, with where to change it, for one managed in Git), with a family's instances below; Resources and Prompts when there are some; and its sign-in, health, calls this month, address and added date beside them. The MCP servers sub-page takes a `usedBy` input whose element becomes the page's Used by tab and reads its connector with the new `useConnectorPageTarget`. Outside the shell the server page is unchanged.
