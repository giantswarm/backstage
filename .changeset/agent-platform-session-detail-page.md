---
'@giantswarm/backstage-plugin-agent-platform': minor
---

Add the session detail page. Clicking a row in the Sessions list now opens
`/agent-platform/sessions/<installation>/<id>`, showing what the session was, how it
ended, and what the agent actually did.

**Read-only.** kagent can rename, delete and continue a session, and the prototype
offers all three — none are wired up, so this ships without a write path.

The page has three parts:

- **Header** — title, status badge, agent (name and avatar, resolved through the
  same `Agent` CR join the list uses), installation, started/last-activity, and the
  session id.
- **Stats** — turns, wall-clock duration, and input/output tokens.
- **Timeline** — the conversation, with the agent's internal work collapsible behind
  a Hidden/Collapsed/Expanded control. Collapsed by default: the working is the
  point of the screen, but a wall of tool payloads is unreadable.

Timeline entries cover user and agent messages (as markdown), reasoning, tool calls
with their arguments and results folded into one entry, delegations to other agents
with the child's own token usage, and approval requests with the user's verdict.
Approvals are deliberately not governed by the activity control — an approval records
the _user's_ decision, so hiding it would erase the trace of their own action rather
than the agent's working.

Decisions worth knowing:

- **Timestamps are per turn, not per item.** A2A messages carry no time of their own
  and kagent's stored events cannot be correlated with them (they are ADK events with
  no `messageId`), so a task's timestamp is the finest granularity that exists. The
  timeline shows it once per turn rather than repeating it on every entry, which
  would imply precision we do not have.
- **Input tokens are labelled "billed, cumulative"** because the raw number is
  startling: every model call re-sends the whole context, so a 4-turn session with a
  large tool catalogue reached 1.4M prompt tokens across 14 calls. Genuine billed
  usage — kagent's own UI sums it identically — but unlabelled it reads as a bug.
  There is deliberately **no combined total**: input and output are priced
  differently, so their sum is not a number anyone acts on.
- **Duration is wall-clock** (`updated_at − created_at`), since kagent records no
  per-turn durations — it includes however long the user was away between turns.
- **Timestamps here are absolute** (`28 Jul 2026, 10:07 UTC`), unlike the list.
  Both ends of a session usually fall on the same day, so the relative form read
  "Started 1 day ago · last activity 1 day ago" for a session that took three
  minutes, and printed "1 day ago" identically on every turn marker — hiding the
  progression the timeline exists to show.
- **Calls through Muster are unwrapped.** Agents reach most MCP tools via muster's
  `call_tool`, so untreated every row reads `call_tool` with the real tool buried in
  the arguments (giantswarm/klaus-gateway#163). Rows now name the tool actually
  invoked and carry a `via Muster` badge; on a real session that unwrapped 7 of 17
  calls. A `call_tool` payload that stops matching the wrapper shape degrades to
  showing the proxy rather than being lost.
- **A missing session is a not-found state, not an error.** kagent answers 404 for
  deleted, never-existed and belonging-to-someone-else alike, and none of those is a
  fault worth an error alert.
- **Rows link with a real anchor** in the title cell as well as a whole-row click, so
  cmd- and middle-click open a new tab and keyboard users have something focusable.
  Not `rowConfig.getHref`: `BUIProvider` is not mounted in this app, so react-aria's
  `RouterProvider` is inactive and a bui `href` would trigger a full page reload.
- **`session` and `session-tasks` queries are excluded from `localStorage`**, for two
  independent reasons — a conversation is user-scoped data that must not outlive
  sign-out on disk, and at ~500 KB per session it would evict the fleet lists the
  persistence exists for.

What the page cannot show, because kagent stores none of it: cost, tokens/second,
context-window usage, the owning team, the trigger that started the session, a linked
work item, produced results, and evaluation. Delegation entries are inert, since the
response does not reliably carry the child session's id.

The Sessions tab's content is now a `SessionsRouter`, which hoists the query client
and the fleet-wide `Agent` list above both screens so opening a session reuses what
the list already loaded.
