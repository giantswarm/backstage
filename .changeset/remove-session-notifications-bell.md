---
'@giantswarm/backstage-plugin-agent-platform': minor
'app': patch
---

Remove the session notifications bell from the agent shell's rail and mobile bar:
the colored session dots in the rail are the notification mechanism. Removed
exports: `SessionNotificationsBell`, `SessionNotificationsBellProps`,
`useSessionNotifications` and `SessionNotificationSetting`. The mute/read
markers stored under `sessionNotifications` in the `agent-platform` storage
bucket are no longer read or written. The dots and their polling are unchanged.
