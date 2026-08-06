---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Make the session detail page refresh itself. It read the session and its
conversation once at mount and never again, so someone watching an agent work saw a
frozen page until they navigated away and back. Both reads now poll, on the two-tier
shape the agent views already use — but with different constants, and each deviation
is deliberate.

**The two reads poll at different cadences.** The conversation goes to 10 s while the
newest task is in an active A2A state and recent, and 60 s otherwise. The session
object stays on a flat 60 s: it is title, agent and timestamps, none of which move
while an agent works, so it polls only so a session renamed or deleted elsewhere
stops looking current. The visible cost is that "last activity" and the duration stat
can trail the timeline by a minute during an active run; both render as absolute
timestamps, so that reads as older rather than as wrong.

**A terminal session relaxes to the baseline rather than stopping.** The tempting
alternative — return `false` and stop, as muster's workflow page does for a finished
execution — is wrong here, because a kagent session is not finished in the same
sense: it can be continued, renamed or deleted from another client. Stopping would
freeze the page for exactly the case this change exists to fix. 60 s equals the query
client's `staleTime`, so nothing is refetched that the client still considers fresh.

**The fast tier is 10 s, not the agents' 5 s, and the age bound is 5 minutes against
their 3.** The agents' constants move a small Kubernetes object on a controller
reconcile cadence. This one moves the whole conversation — a real four-turn session
measured ~500 KB, re-parsed row by row through `a2aTaskWireSchema` and then
deep-compared, all on the main thread — and it tracks an agent _turn_, which
routinely runs minutes when there are many tool calls. A 3-minute bound would have
backed off in the middle of exactly the run someone opened the page to watch.

**`input-required` and `auth-required` are handled by that bound, not by a special
case.** They are active states, but they wait on a human and this page offers no way
to reply. They start fast, relax once nobody answers inside the window, and re-engage
on their own when someone answers elsewhere and the newest task's timestamp advances.

**There is no cheaper probe, which is why the interval carries the whole cost.**
kagent's API serves no `HEAD` — every route is registered for one method on a
gorilla/mux router, which matches methods exactly — and sets no `ETag` or
`Last-Modified`, so there is no conditional GET and a full re-read is the only way to
ask whether anything changed. The session object's `updated_at` tracks task-status
writes to the millisecond and could gate the expensive read later, but only once
somebody confirms kagent bumps it per appended event rather than only on state
transitions; if it is the latter, a gated design would show nothing for the whole
duration of a turn.

**One non-obvious thing that made the simple design viable.** An unchanged poll costs
no re-render at all: react-query's structural sharing returns the previous reference
when the refetched payload is deep-equal, and `normalizeTaskList` yields plain
objects out of zod, so the `useMemo`s that rebuild the timeline never re-run. No
`select`, memoisation or content hashing was needed.

**The age bound applies on every path, including the one where it is most needed.**
`status.timestamp` is optional at the parse boundary, and `normalizeTimestamp` also
rejects Go zero time and anything unparseable — so an active task can carry no usable
time of its own. Treating that as "just changed" (which is what `isAgentConverging`
does, safely, because a Kubernetes object always has `lastTransitionTime`) would make
the fast tier _unbounded_ on exactly the case the bound exists for: an agent that died
mid-turn. The interval falls back to the newest usable timestamp anywhere in the
conversation, and drops to the baseline when nothing in it carries one — losing the
"state and timestamp from the same task" property on purpose, because an age basis
that exists beats a fast tier nothing can stop.

**Polling also made an existing condition wrong, so that is fixed here too.** The
page treated any error as fatal. react-query keeps `data` and sets `error` on a
failed _refetch_, and the query client deliberately does not retry
`ServiceUnavailable`/`Unauthorized`/`Forbidden` — so with polling, one proxy hiccup
would have replaced a fully rendered conversation with a danger alert until the next
successful poll. The fatal branch is now gated on having no session at all, and an
error with one in hand shows a warning notice above the page instead. A local `Alert`
rather than the shared `ErrorsProvider` notice the agent detail page uses, because
the sessions router mounts no `ErrorsProvider` and adding one would mean splitting
this page into wrapper and content for a one-line message.

Keeping the page up needed three further distinctions, because the two reads fail
independently. A tasks read that fails on **first** load leaves the timeline, turns
and tokens at zero while the session read succeeds, so the hook now reports
`hasConversation` and the page keeps the fatal branch when the conversation is
_absent_ rather than empty. A poll answering 200 with no readable session no longer
claims the session was deleted once one has already been read — and the query function
coerces that case to `null`, because react-query rejects an `undefined` resolve, which
was surfacing `[…query key…] data is undefined` to the user and had quietly made the
`isSuccess && !data` branch unreachable. And a delete in flight now disables both
reads (`enabled: !isDeleting && !isDeleted`): `refetchType: 'none'` governs
invalidation-driven refetches only, so it never held off a scheduled interval tick
landing mid-navigation.

Manual refresh is deliberately still absent. Staleness is capped at 60 s now, and the
control would have to live in the page header, which renders outside this plugin's
`QueryClientProvider` — so it needs new fields on `SessionDetailView` threaded
through the memo whose whole purpose is to stop the header slot re-registering on
every poll. That is a bigger change than the polling it would accompany.
