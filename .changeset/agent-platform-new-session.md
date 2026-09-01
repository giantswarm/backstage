---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-backend': minor
---

Start a new kagent session. The Sessions tab now carries a composer above the list —
collapsed to a single line, expanding on focus — with a prompt, an agent picker and
"Start"; the agent detail page offers the same composer in a dialog with that agent
preselected. Cmd/Ctrl+Enter starts, Enter inserts a newline.

**Create, navigate, then send, in that order.** Backing this is a new
`POST /kagent/sessions` route over kagent's `POST /api/sessions`. Only the create
happens before navigating: `message/send` blocks for the whole turn, so awaiting it
first would leave the user on the list for up to half a minute, and firing it
un-awaited would lose the optimistic echo along with the component holding it. The
prompt travels with the navigation instead and is sent by the session detail page, so
the message, the "Working…" indicator and the failure path are all the ones that
already existed for a reply. The router state is consumed once and cleared — it
survives a reload and a Back navigation, and re-reading it would start a second paid
turn with the same prompt.

**Titles are derived from the prompt**, because kagent does not auto-title: a create
with no `name` comes back with no `name` at all. Whitespace collapses, the title is cut
to 60 characters at a word boundary, and it stays renameable.

**Only ready agents can be chosen.** Non-ready ones are listed but disabled, with their
readiness message as the reason — offering them would create a session whose first turn
then fails with nothing on screen explaining why, and hiding them would make a broken
agent indistinguishable from one that never existed. Picking an agent picks its
installation, since that is part of an agent's identity, and the picker groups by
installation once the fleet has more than one.

The default agent is the **last one used**, remembered per browser and re-resolved
against the live fleet, so a deleted or no-longer-ready agent falls back to asking for a
choice. Nothing is preselected on first use: unlike the prototype we have no canonical
"general purpose" agent, and guessing costs money against something that can act on a
cluster.

The prototype's visibility/team selector is dropped — kagent has no sharing model for it
to map onto.

Also: **answer an agent's question**. When an agent stops and asks — kagent's
`input-required` — the session detail page now replaces the reply composer with an
answer panel: radio buttons for a single choice, checkboxes for a multi-select, and a
free-text box on every question — a choice list is not exhaustive, and typed words do
reach the agent because they go inside `ask_user_answers` rather than the message's text
part. A tool the agent wants permission to run gets Approve/Decline instead. The reply
composer stays on screen, disabled and saying why: a plain message cannot answer a
confirmation, but a box that disappears reads as the feature being missing rather than
blocked. kagent's own UI makes both of these calls.

The important part is that the answer **names the task it resumes**
(`params.message.taskId`). Without that, kagent opens a new task: the agent reads the
words, but its suspended tool call never receives a response, so the task stays
`input-required` for ever and the model history holds a `tool_use` with no
`tool_result`. Verified on gazelle — a session with three questions answered from Slack
holds seven tasks, three of them stranded; the same question answered here resumed a
single task in place and the agent continued where it stopped. (klaus-gateway sends the
id as `params.taskId`, which no A2A version defines and the v0 conversion drops. That
is a one-line fix on their side.)

Three further details of the format, each verified against kagent's source and against
live traffic: `decision_type` is mandatory even for a question, because both executors
read it before they look at the answers; `ask_user_answers` is positional with one
array per question, and kagent treats a short array as "unanswered" rather than an
error — so the panel will not submit until every question has something; and an answer
carries the choice's own text, not its index.
