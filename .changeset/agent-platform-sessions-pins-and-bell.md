---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Sessions grow pinning and a notification bell in the agent-platform shell.

**Rail session history**: the rail's recent-sessions list now leads with a
"Pinned" group (pin/unpin on each row's hover affordance, persisted per user
via the storage API, so pins roam with the user-settings backend), groups the
rest under "Today" / "Previous 7 days" / "Earlier" like the prototype, and
polls the derived session states on the fast tier so the "Needs you" pill and
the "Working" dot move within ~10 s while the tab is visible.

**Sessions page (shell layout)**: each row gets a pin toggle beside its
actions menu; pinned sessions surface in a leading "Pinned" group ahead of the
day groups, and a "Pinned" filter chip appears beside the state chips once
something is pinned.

**Notification bell** (`SessionNotificationsBell`, mounted in the shell rail's
footer and the mobile bar): an unread badge counting the sessions waiting for
input, and a ~400 px panel (responsive at 375 px) listing them — each row
links to its session, with per-session mute and mark-read/unread and a "Mark
all read". Mute and read markers persist per user in the `agent-platform`
storage bucket under `sessionNotifications` (new hook
`useSessionNotifications`). Poll-based only — the platform has no push path
yet (gap G5), so desktop/web-push notifications are deliberately absent.
