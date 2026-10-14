---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

The ⌘K command palette: a client-side search over what the shell already
reads — session titles, agents (name and description), skills and
connectors — grouped by kind with filter chips, capped per group with a
"+N more" count, and a final row handing the query to the classic
portal-wide search (`/search`). Opens on ⌘K / Ctrl+K (only inside the agent
shell and never from inside an input), from the rail's Search item and from
the mobile bar's. Arrow keys walk the results, Enter opens one, and ⌘↵ on an
agent starts a new session with it through the usual composer — tracked as
`AgentPlatform.sessionStarted` with the new `searchPalette` entry point.
Session content is not searched (platform gap G6): titles and metadata only.
