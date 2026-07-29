---
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Proxy kagent's session detail and session tasks, the transport the upcoming
Agent Platform session detail page needs.

- `GET /kagent/sessions/:id` — one session plus its stored events.
- `GET /kagent/sessions/:id/tasks` — the session's A2A tasks, which carry the
  conversation (`history`), its state (`status.state`) and per-message token
  usage.

Both require `?installation=` and a forwarded user token, and both pass kagent's
JSON through verbatim, as the existing routes do.

Two details worth knowing:

- **The conversation comes from `…/tasks`, not from `…/sessions/:id`'s `events`.**
  That is what kagent's own UI renders from, and the two payloads carry different
  things: an event's `data` is a JSON _string_ holding an A2A message (doubly
  encoded) and carries no state or token usage, while task history is already
  structured and carries both. Events are still useful for one thing — A2A
  messages have no timestamp of their own, so per-message times come from the
  events' `created_at`.
- **No `A2A-Version` header is sent.** kagent's `NegotiateA2AWireVersion` treats a
  missing header as the legacy v0 wire on both v0.9.9 and v0.10, which is the
  shape kagent's UI consumes and therefore the best-tested one. Opting into the
  v1 wire is a deliberate future migration.

Session ids stay opaque — real responses mix 64-character hex strings and UUIDs,
so nothing validates or normalizes one. In particular they are not trimmed:
Express hands over the decoded segment, so trimming would re-encode a _different_
id and 404 in a way indistinguishable from a missing session.

A session belonging to another user answers **404**, exactly as a deleted one
does, because kagent scopes the lookup by the token's user id. Both are expected
outcomes for a stale deep link, so neither returns a 5xx — which
`MiddlewareFactory.error()` would log at `error` and forward to Sentry.

404 messages are now per-endpoint, because three different things arrive as one:

- Nothing listening at the host (`fetch` rejects) — "kagent is not available
  here", the fleet-wide wording the frontend's silent classification relies on.
- kagent answering "no such resource" (404 with a JSON body, since its error
  middleware always answers JSON) — "that session does not exist". Previously
  this read "The kagent API is not available for installation X", i.e. a
  bookmarked link to a deleted session reported an outage on a healthy
  installation.
- The endpoint not existing (404 with a non-JSON body, because kagent registers
  no custom `NotFoundHandler` and net/http answers `text/plain`) — "this kagent
  predates that endpoint". Without this, an installation on an older kagent would
  report "session not found" for every session forever, and with no version probe
  there would be nothing else to go on.

kagent's own 404 message is not forwarded: its middleware appends the underlying
error, so a session 404 reads `Session not found: no rows in result set`.
