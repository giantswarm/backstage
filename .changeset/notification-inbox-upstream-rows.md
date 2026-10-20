---
'@giantswarm/backstage-plugin-analytics-react': minor
---

The Agent Platform shell's Notification inbox also lists what other portal
features send the person through the standard Backstage notifications service:
plain rows with the title, the description, the age and the link, merged with
the session rows newest first. They count towards the badge and the tab
title, "Mark all read" marks them read in the notifications store too, and a
new one raises a toast and, once switched on, a desktop notification. The
inbox reads them through the upstream notifications API client and follows the
backend's `notifications` signals.

`AgentPlatform.notificationOpened` takes `kind: plain` for such a row.
