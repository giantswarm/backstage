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

**Only a 400 enters that fallback, and it means "this kagent predates the fix" —
nothing more.** The PUT's status says nothing about whether the session exists:
v0.9.x rejects the missing `agent_ref` _before_ it looks anything up, so a live
session and a deleted one both answer 400, and the 404 that would separate them is
reachable only on v0.10+. Everything else (401, 403, 404, 5xx) is surfaced as the
failure it is.

**A read-back, not the status, is what enforces "never create".** Before writing, the
fallback fetches the session and gives up if it is gone — otherwise the upsert, which
inserts when nothing conflicts, would resurrect a session someone had just deleted
under its old id. That read also makes the echoed `agent_id`/`source` authoritative:
they are overwritten by the write, so they come from kagent rather than from the
browser, where a stale or unparsed value would blank a column nobody asked to touch.

Every remaining way the fallback can fail, it fails before writing, and each is a
**4xx** rather than a server error: the session is gone (404), it has no agent (409),
kagent cannot resolve that agent (409), or a sandbox-workload agent already holds a
session (409). None is actionable, and on a fleet where every installation takes this
branch a 5xx would mean a standing Sentry issue per case.

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
- Confirming does not close the dialog: a rename can fail, and closing on submit would
  throw away the only surface left to report it. Nor can it be dismissed while the
  request is in flight — including via the close button bui's `DialogHeader` always
  renders, which `isDismissable` does not reach. Closing there would leave the mutation
  running with nowhere to report a failure.
- The dialog seeds its field on the open transition only, never on a `title` change:
  the session read polls, so re-seeding would wipe an edit in progress when the
  session is renamed in another tab.
- `updated_at` does move, so a renamed session rises to the top of the list — correct
  for an edit.

`agent-platform-backend` gains a `PUT /kagent/sessions/:sessionId` route (user token
required, same reasoning as the delete: without one an `unsecure` controller would
rename the shared default user's session), and its kagent client learns to send
request bodies. The route takes only the name — the workaround's inputs come from
kagent, not from the caller.

On the frontend, `throwIfNotOk`'s 400 → `NotFoundError` mapping is now opt-out. That
mapping exists because a 400 from this proxy meant "no kagent endpoint for this
installation", which the reads treat as silent; the rename route also answers 400 for
a name it refuses, which must not borrow the one name the plugin reads as "kagent is
absent".
