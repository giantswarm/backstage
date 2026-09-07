---
'@giantswarm/backstage-plugin-muster': minor
'@giantswarm/backstage-plugin-agent-platform': patch
---

The MCP Servers tab no longer carries an installation picker of its own: the
Agent Platform page header's installation selector is the one control that
scopes every tab, MCP Servers included. Where the selector's choice and the
muster shown differ -- under "All installations" (the section shows one muster
at a time, the home installation's) or when the pinned installation runs no
muster the portal knows -- the muster views say so in one line instead. The
header selector marks an installation whose muster is not reachable from this
portal on the MCP Servers tab, as it already did for kagent on the other tabs;
`useMusterInstallations` (the backend's installation list with reachability,
usable outside the muster section) is exported for that.
