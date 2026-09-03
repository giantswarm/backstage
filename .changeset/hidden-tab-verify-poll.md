---
'@giantswarm/backstage-plugin-muster': patch
'@giantswarm/backstage-plugin-muster-backend': patch
---

Keep the MCP registration wizard's verify panel polling while the tab is hidden. The server connects during exactly the window where the user wanders off to another window or tab, and react-query skips interval refetches for unfocused tabs by default — the panel silently froze on "Waiting for the server to appear…" until it was refocused. The backend's `/servers` route now also asks muster for failed servers (`showAll`) with their raw errors (`verbose`); muster hides `Failed` servers from `core_mcpserver_list` by default, which made a failing server vanish from the runtime view instead of showing up with its error in the verify panel and the server detail.
