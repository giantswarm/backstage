---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
'@giantswarm/backstage-plugin-analytics-react': minor
---

A session's actions menu, on its page and on each row of the Sessions list,
has a Notifications submenu: Default, All activity or Muted, the current one
ticked. The level is kept per person in the user-settings backend, with the
sessions the portal started and what the person has seen in the Notification
inbox; `useSessionNotificationRecord`, `useSessionNotificationSettings` and
`useNotificationSeenMarks` read and write that record. Entries for deleted
sessions are pruned, only after a complete read of the installation's
sessions (`KagentApi.listSessionsIfComplete`); the backend now flags a session
listing cut at its page limit as `truncated`. Settings writes read the stored
value first and refuse to write on a read that failed. Adds the
`AgentPlatform.sessionNotificationLevelChanged` event.
