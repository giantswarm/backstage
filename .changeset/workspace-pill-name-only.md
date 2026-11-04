---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The session header's workspace chip shows only the workspace's name. Its last
synchronization and the number of repositories fetched before the first turn
("Synchronized 4 h ago · 1 repository fetched") move into a tooltip on hover
and keyboard focus. The tooltip is headed "Workspace" in bold, and gives the
full name under it when the chip cuts it off.
The chip's accessible name still carries all of it, and a press still opens
the workspace drawer.
