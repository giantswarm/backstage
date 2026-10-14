---
'@giantswarm/backstage-plugin-agent-platform': minor
'app': minor
---

`RecentSessions` takes a `shellRail` prop that adds an "All sessions" link to the sessions list next to its label and a dot before each session whose agent is working.

Under the `agent-platform-shell` flag, the rail drops its Sessions item: the recent sessions' "All sessions" link opens the list instead. The mobile bar, which lists no recent sessions, keeps the item.
