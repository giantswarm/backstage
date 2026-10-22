---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

A session's live view now survives a cut stream. When the stream of a running
turn ends before the turn does, as every stream does during a kagent
controller rollout, the page resubscribes to the turn and continues the reply
where it stopped, saying "The live view was interrupted. Reconnecting…"
meanwhile. When that keeps failing for a few seconds, the page follows the turn
through the conversation poll as before and says the live view could not be
restored. The backend adds
`POST /kagent/sessions/:sessionId/tasks/:taskId/subscribe`, which relays
`A2AService/SubscribeToTask` as the signed-in person.
`agent-platform-common` adds `STREAM_MAX_DURATION_MS`, the bound the relay and
the page share.
