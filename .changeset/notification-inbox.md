---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': minor
'@giantswarm/backstage-plugin-analytics-react': minor
---

The Agent Platform shell gets a Notification inbox: a bell with an unread count
on the rail's Profile row (on a phone, the count on the Profile item and a
"Notifications" entry first in its menu), opening the sessions that need the
person: waiting, failed, or with a finished turn at All activity. Clicking a
row opens the session and marks it read; a row can mute its session, and "Mark
all read" clears the count. Rows that arrive while the shell is open raise a
toast, replacing the needs-input toast, and, once switched on in the overlay, a
desktop notification. The unread count prefixes the tab's title.

`agent-platform` exports `useNotifiableSessions` (the person's sessions and
their states, read every 10 s while the tab is visible and every 60 s while it
is hidden), `AgentAvatar`, `sessionsListSearch` and `PHONE_FULL_SCREEN_DIALOG`,
and no longer exports `NeedsInputToasts`. `useFleetSessionStates` takes
`refetchIntervalInBackground` and tells when every installation has answered
(`isComplete`). `markSeen` and `markManySeen` take an optional reason, which
reports a row the person opened (`AgentPlatform.notificationOpened`) or "Mark
all read" (`AgentPlatform.notificationsMarkedRead`), the two new events in
`analytics-react`.

`ui-react` adds `useShellDocumentTitleCount`, which prefixes every shell page's
document title with a count, "(2) Sessions · Agent Platform", and
`usePageAttention`: whether the page is visible, and whether its window has
the focus.
