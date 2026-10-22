---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-analytics-react': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-muster': patch
---

The session page's actions menu has **Export session**: it saves the session
and all of its tasks, as kagent stores them, as one JSON file, also mid-turn
and while the session waits on the person. A notice beside it says the file
holds everything the agent saw and is customer data. A session the portal
cannot read whole (up to 1,000 turns, fewer with large messages) saves no file
and points to agent-manager's `get_session`. The format is described in
`docs/agent-platform-session-export.md`; a saved export is counted as
`AgentPlatform.sessionExported`.

The backend's session tasks route keeps the `nextPageToken` it did not follow
when its read was cut short. `ui-react` exports `saveFile`, which the manifest
Download and muster's tool-result download now share; it keeps the file's URL
until the browser has taken it.
