---
'@giantswarm/backstage-plugin-agent-platform-common': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

The session-states read gives a failed session a short failure class
(`failureReason`: `model-unavailable`, `tool-failed`, `runtime-lost` or
`other`), classified on the backend from the turn's or the instance's failure
text, which never leaves the backend. A session kagent marked as having lost
its runtime is `runtime-lost` whatever its newest turn's state.

`agent-platform-common` exports the row rule of agent session notifications:
`deriveSessionNotificationRow` takes one session's state, its Notification
level (`default`, `all`, `muted`) and whether it was started in the portal, and
returns the Waiting, Failed or Turn finished row it has now, if any, with the
row's identity (`id`).
