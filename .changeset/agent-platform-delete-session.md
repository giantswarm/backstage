---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Add **Delete session…** to the session detail page's kebab menu. It calls kagent's
`DELETE /api/sessions/:id` through the agent-platform proxy — the first write on the
kagent REST side, so `agent-platform-backend` gains a `DELETE
/kagent/sessions/:sessionId` route and its client a method parameter. Everything
else about the transport is the reads' machinery reused: same installation
resolution, same forwarded per-installation Dex token, same status mapping.

**There is no permission gate, because there is nothing to ask.** Unlike the agent
delete's `SelfSubjectAccessReview`, a session is not a Kubernetes object: kagent
derives the acting user from the forwarded token alone, so the item is simply offered
on any session that loaded. The route makes that token **required** for the same
reason — without one, a controller running in `unsecure` mode would delete the shared
default user's session on behalf of nobody in particular.

**The dialog states both halves of what "deleted" means**, because an earlier draft
of the copy could only have been wrong in one direction or the other. kagent's delete
is soft (`UPDATE session SET deleted_at = NOW()`, with every read filtering
`deleted_at IS NULL`), so the conversation is gone as far as anything in Backstage
can see and there is no undo anywhere in this UI — but the record is not erased from
kagent's store. On a deployment the `/me` probe reports as **not user-scoped**, the
dialog adds a line saying the session may have been started by somebody else. That
warns rather than withholding the action: kagent authorizes the call either way, and
the person reading is the one who knows whose session it is.

**A delete that matched nothing still answers 200.** kagent's statement is an
`:exec`, so zero affected rows is not an error — a session that never existed, was
already deleted, or belongs to another user all succeed silently. Nothing tries to
detect that: a resolved promise means "kagent accepted this", and the refreshed list
is what shows the truth a moment later. It also means there is no 404 path and no
"already gone" case on the write side.

**One non-obvious piece of cache handling.** The sessions list key is invalidated
normally — it is shared with `useAgentSessions`, so the fleet list and the agent
page's recent-sessions card both correct themselves. This session's own two reads are
invalidated with `refetchType: 'none'`: the detail page is still mounted at that
moment, so refetching would race the navigation with a request that now 404s and
flash "Session not found" at someone who just deleted it deliberately. Marked stale
without refetching, a later visit to the same URL revalidates and reaches the
not-found state properly.

The frontend client's write path also tolerates a body it does not need — a 2xx with
an empty or non-JSON body is a success, since a future kagent answering 204 has still
performed the delete — while still refusing an error reported in-band on a 200, the
same rule the session readers already apply.

**The kebab menu is given an explicit width, and that line is load-bearing.** bui
leaves `.bui-MenuContent`'s width to its content above a `min-width: 150px` (its own
`width` fallback is the string `"undefined"`, which the browser discards), and a
`MenuItem` puts `gap: var(--bui-space-6)` — 24px — between label and trailing slot.
"Delete session…" with its icon wants ~155px, just over the minimum, so the popover
rendered at the natural width and then settled back to 150px. That second layout pass
made react-aria's popover resize observer trip the browser's "ResizeObserver loop
completed with undelivered notifications" — twice, on every open of the menu. Sentry
filters that message by default and production has no error overlay, but the
dev-server overlay covers the page with it, which makes the page miserable to work on.
Sizing the menu up front means one layout pass and no warning. The agent kebab escapes
this only because its items happen to measure just under 150px.

Verified against the kagent source at both `v0.9.9` (what the fleet runs) and
`v0.10.0-rc1`: the handler, the SQL and the 200-with-envelope response are identical
in both. Deleting from a list row is deliberately not offered, since a destructive
action on a row someone is scanning past is easy to hit by accident.
