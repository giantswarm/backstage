---
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

`POST /kagent/sessions/:sessionId/answer/stream` answers a confirmation over
`A2AService/SendStreamingMessage` and relays the resumed turn's events as SSE —
the streaming sibling of the unary answer route, with the same body, the same
validation and the same relay as the messages route's streaming sibling. The
unary route stays. What the new route fixes is the unary one's blind spot: held
for the turn timeout and then answering `202 pending`, it left a turn that
never landed with nothing for the page to show — and on the kagent API v2 line
the caller's deadline was what ended the agent's turn.
