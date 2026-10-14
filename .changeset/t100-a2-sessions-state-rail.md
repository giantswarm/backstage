---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-common': patch
---

A session whose agent ended its turn is "Idle" instead of "Finished", and its composer invites a reply to the agent instead of resuming the session. The session header shows "Working" from the moment a message is sent, from the same state the conversation shows. The rail always lists sessions waiting for you above the recent ones and counts them beside "All sessions". The sessions list orders and groups sessions by last activity, as the rail does, in a "Last active" column.
