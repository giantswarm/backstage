---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-ui-react': minor
---

Add a session switcher rail to the session detail page: the operator's
non-terminal sessions, grouped WAITING then RUNNING, so moving between live
sessions no longer means going back to the list. Each card shows a compact age,
the session title and the agent.

Three groups: WAITING, RUNNING, and RECENTLY FINISHED. The prototype's own third
group, Queued, has no kagent state behind it; this third one is ours. Its `team`
line has no equivalent either, so the agent takes it, and its trigger icon has no
backing data at all.

**A finished session lingers for an hour** rather than vanishing the moment
its turn completes — which is precisely when it is most worth reaching, since the
reply you were waiting for has just landed. Its own neutral group, so the rail
never claims a finished session is still working, and the header's "N
non-terminal" count excludes it. A terminal session with no usable `changedAt` is
dropped rather than graced: it cannot be placed in time, so it would linger for
ever. Note this bound pulls the opposite way to `ACTIVE_MAX_AGE_MS` — that limits
how long an _active_ state is believed, this how long a _terminal_ one is shown.

**Scoped to the installation in the URL.** `SessionsDataProvider` is deliberately
local to the list page, so the rail runs a single query on the shared
`sessionsQueryKey` instead: arriving from the list costs nothing, and a deep link
warms the cache for it. The Sessions tab stays the fleet-wide surface.

**It deliberately does not apply `ACTIVE_MAX_AGE_MS`.** That five-minute bound
stops the composer's "Working…" indicator promising progress after an agent dies
mid-turn — a claim about _now_. A session stuck in `working` for three days is
exactly what an operator needs to see, so it appears in RUNNING with `3d` on it.
A session with no state at all is excluded: "created, never run" is not
"non-terminal". Sorting differs per group, because each answers a different "what
is most urgent": Waiting longest-blocked first, Running most-recently-active
first.

**The conversation keeps the document scroller**, which is the load-bearing
layout decision rather than an aesthetic one — the composer docks with
`position: sticky; bottom: 0`, and both `scrollToBottom()` and the streaming
auto-follow measure `document.scrollingElement`. The rail is a sticky,
internally-scrolling box instead, capped against the viewport. Below `sm` it is
not rendered at all rather than hidden, so a narrow viewport pays for none of its
polling. It renders on the loading, not-found and unreadable states too: a dead
session is precisely when the switcher is wanted.

**Cards are real anchors**, not bui `List` rows and not `Card` with `onPress`.
Navigation between URLs is `aria-current="page"`, which a react-aria `GridList`
cannot express — its rows are `aria-selected`, a different claim. Anchors are
also cmd- and middle-clickable, where a bui `href` would full-page-reload because
`BUIProvider` is not mounted in this app. Hand-rolling additionally means no new
`.bui-*` overrides: `RecentConversations` needed five for a single-line row.

The current card's accent is an **inset shadow**, not a thicker left border. A
border would either shift the selected card's text or, reserved as transparent on
every card, leave every _other_ card with no left edge at all. The rail also
sticks 16px below the viewport top rather than flush against it, and does not
override the flex parent's `stretch` — `align-self: flex-start` content-sizes a
sticky child and silently stops it sticking.

**"All caught up." is only said when the summary was complete.** The route
reports `unreadable` (asked and failed) and `skipped` (never asked) so the rail
can tell "nothing is active" from "we cannot tell": with either non-zero it says
so and offers a retry, footnotes the shortfall when it does have groups to show,
and renders the header count as `N+` because it is then a floor. Both cases are
reachable — every task read failing still answers 200, and a session blocked for
days has an old `updated_at`, making it the first to fall past the cap.

Collapsing is remembered under `gs-agent-platform-session-rail-collapsed` and
leaves a 48px strip rather than nothing — the rail exists to answer "is anything
waiting on me?", and the strip's dots and counts keep answering it without
needing a floating re-open control on a page with no toolbar for one.

**The detail page overrides the summary for its own session.** The backend caches
that summary for 15s, which leaves it structurally behind the page — so appending
a message to a finished session would otherwise leave it filed under RECENTLY
FINISHED while the agent is visibly working beside it. The page passes its own
reading down and it wins for that one session; every other entry is the
summary's. The signal is the same `send.isSending || isAgentWorking` the
"Working…" indicator uses, so the rail and the page cannot disagree — and the
in-flight send matters on its own, because the conversation's verdict only lands
once a poll has seen the new task, up to 10s later.

**New in `ui-react`: `ArrowMenuOpenIcon` and `ArrowMenuCloseIcon`.** The rail's
collapse control uses Material Symbols' dedicated pair for folding a side panel,
hand-vendored because no icon package here ships them: `@material-ui/icons`
4.11.3 is the _classic_ Material Icons set, which never had a
collapse/expand-panel glyph at all — searching all 1120 of its icons for
"collapse", "expand", "sidebar" or "drawer" returns nothing. Their
`0 -960 960 960` viewBox is Symbols' own offset grid and has to travel with the
paths, or the glyph renders off-canvas. Apache-2.0, outlined, weight 400.

**Also new in `ui-react`: `PLUGIN_HEADER_HEIGHT`, `CONTENT_PADDING` and
`PLUGIN_CONTENT_VIEWPORT_OFFSET`.** A full-height panel has to anchor to the
viewport and subtract the chrome above it, and three plugins had each hardcoded
the same 89. `ai-chat`'s `RecentConversations` now uses the shared constants.
`docs/ui.md` gains a section on the three in-repo scroll-containment strategies,
when each applies, and the `align-items: stretch` gotcha that silently stops a
sticky flex child from sticking.
