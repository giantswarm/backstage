---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

An answer to a confirmation, a question or a sign-in names the status message
it answers (`askedIn`), and the backend refuses it with a 409 when the task now
asks in another one: the task was answered elsewhere, from Slack, and paused
again on a new request. Before, the late answer was applied to that new
request.
