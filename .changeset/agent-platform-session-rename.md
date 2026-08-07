---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Let a session be renamed from its detail page. Two ways in: a `Rename session…` item
in the kebab, and the page title itself — a real button stripped of its chrome rather
than a click handler on the heading, so it is keyboard-reachable and announced as
operable. Both open the same dialog, which is why its open state sits on the page and
not inside the actions menu the way the delete's does.

Worth having because kagent derives session titles from the first message and
truncates them to 20 characters, so a session that mattered ends up filed under half a
sentence.

**kagent's rename endpoint does not rename on the version the fleet runs**, and this
is what shapes the implementation. `PUT /api/sessions/{session_id}` is registered on
v0.9.x, but its handler requires both `name` and `agent_ref`, looks the session up by
`*sessionRequest.Name` — treating the new name as the id — and assigns only
`session.AgentID`. `session.Name` is never written. It was fixed in v0.10.0-rc1; GS
pins 0.9.9, so on every installation we run today the correct endpoint is inert.

The write therefore falls back to `POST /api/sessions` with the existing `id`, whose
`StoreSession` is an upsert on `(id, user_id)` that does write `name` — identical SQL
in v0.9.9 and v0.10.0-rc1. Echoing the session's own `agent_id` back as `agent_ref`
round-trips exactly, since kagent's `ConvertToPythonIdentifier` only rewrites `-` and
`/`, neither of which survives in an already-encoded id.

**Only a 400 triggers that fallback**, which is the safety property of the whole
design. A 404 means the session genuinely is not there, and the upsert _inserts_ when
nothing conflicts — falling back on one would quietly create a new empty session for
someone renaming a session that had already been deleted. Everything else (401, 403,
5xx) is a real failure and is surfaced as one. Every remaining way the fallback can
fail, it fails before writing: no agent to name, an agent kagent cannot resolve, or a
sandbox-workload agent that already holds a session.

All of the fallback is marked `TODO(kagent-0.9)` and comes out when no installation
runs kagent v0.9.x, leaving the plain PUT.

Smaller decisions:

- The invalidations **refetch**, unlike the delete's `refetchType: 'none'` — nothing
  navigates away, so the page has to show the new name. Both are awaited inside the
  mutation, so the dialog closes onto data that has caught up rather than onto the old
  title.
- The name is trimmed, required, and capped at 255 characters. That bound is ours, not
  kagent's (`session.name` is unbounded `TEXT`), and the backend route enforces it as
  well as the dialog — a `maxLength` on an input is a courtesy, not a guard.
- Confirming does not close the dialog, and the dialog cannot be dismissed while the
  request is in flight: a rename can fail, and closing on submit would throw away the
  only surface left to report it.
- `source` is echoed back because the upsert overwrites it from what it is sent. v0.9.9
  omits it from its reads, in which case the column is already null and sending nothing
  changes nothing. `updated_at` does move, so a renamed session rises to the top of the
  list — correct for an edit.

`agent-platform-backend` gains a `PUT /kagent/sessions/:sessionId` route (user token
required, same reasoning as the delete: without one an `unsecure` controller would
rename the shared default user's session), and its kagent client learns to send
request bodies.
