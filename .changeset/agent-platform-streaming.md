---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Stream the agent's reply. Sending a message into a kagent session now goes over A2A
`message/stream` (relayed byte-for-byte by a new
`POST /kagent/sessions/:sessionId/messages/stream` route, flush-wrapped past
Backstage's global `compression()`), so the reply appears in the session detail page
as the agent produces it — text as it is written, tool calls as they happen — instead
of all at once when the turn ends.

**The stream is a preview; the poll stays the source of truth.** Streamed events are
folded into the same `TimelineItem` shapes the polled history produces and rendered
as a live overlay on the timeline. An item the poll has already delivered is dropped
by `messageId` recognition — the rule the optimistic user message already follows —
and the whole overlay is discarded once the send's awaited invalidation has put the
canonical history on screen. Both executor dialects are handled: text chunks on
non-final status-updates (Python) and `partial`-stamped artifact updates with a
`lastChunk` sentinel (Go).

**Losing the stream is not losing the message.** The verify-not-report contract of
the `message/send` path carries over exactly: any event proves the turn was
dispatched, so a stream cut mid-turn (a gateway's 60 s door, a network drop) resolves
like the existing 202 and the 10 s poll follows the turn to its end. A transport
failure before any event triggers one read of the session history to check whether
the sent `messageId` landed — present means dispatched, absent keeps the failure and
hands the text back to the composer. A decision (a rejected message, an unknown
agent, an in-band A2A error) is reported as made, never verified away. On routes
whose request timeout is disabled (agent-platform-standalone sets `0s`) the stream
lives as long as the turn; where a door cuts it, the page degrades to exactly its
pre-streaming behaviour.

Answering an agent's question still goes over `message/send`: a confirmation seen on
the stream is deliberately not previewed, because only the polled task carries the
state the answer panel can actually resume.
