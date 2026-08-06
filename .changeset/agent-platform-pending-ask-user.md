---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Render the question a session is waiting on. A session whose last turn ends by asking
the user something showed nothing at all for that question — the timeline stopped at
the agent's previous message, so it read as if the agent had trailed off mid
conversation, with only the "Waiting for input" badge in the header hinting otherwise.

The question fell between two paths that each assumed the other had it. The raw
`ask_user` call **is** in `task.history`, but it is deliberately skipped as ADK
plumbing (`INTERNAL_TOOL_NAMES`) on the grounds that the approval path renders it —
and that path only ever read `history`. For an _unanswered_ question there is nothing
there to read: kagent puts the pending `adk_request_confirmation` on
`task.status.message` and nowhere else. Verified against a live gazelle session, where
the pending message carries a `messageId` that appears in none of its task's history
entries.

So `status.message` is now appended as a final history entry when the task is waiting
on it, which gets the existing approval handling — dedupe, part walking, the
`ask_user` -> `asks: 'input'` discrimination, and the cross-task verdict tracking —
without a second code path. kagent's own UI solves the same problem with two separate
passes that are then concatenated; one list keeps the question in its chronological
place instead of at the end.

Gated on the state (`input-required` / `auth-required`) rather than merely on the
message being present, which is what makes the card self-clearing. kagent's resume
path settles this: a HITL decision resumes the **stored** task — `executor.go` takes
the `StoredTask != nil` branch, emits `working` on that same task and appends the
decision to its history, and `BuildResumeHITLMessage` will not even build a resume
unless that task is currently `input-required`. So the asking task always leaves
`input-required` once answered, the prompt stops being emitted from `status`, and the
now-answered confirmation renders from history with its verdict. The question cannot
appear twice, and cannot linger as "Awaiting a reply" after it has been answered;
there is a test for exactly that overlap. The alternative — emitting whenever
`status.message` exists — would also risk duplicating a terminal task's final message,
which is what `status.message` holds once a task completes.

**The question itself now renders as prose.** Making the row appear was not quite
enough: `ask_user` arguments were only reachable by expanding the row, where they
showed as JSON in a monospace, single-line-ellipsised slot built for tool payloads. A
question is the last thing the agent _said_, so the approval item now carries the
extracted `questions` and the entry renders them as markdown, numbered when an
`ask_user` asks several at once. With the questions on the row there is nothing left
behind the expander, so it renders as a plain row rather than offering a click that
reveals a worse copy of what is already on screen. This applies to already-answered
questions too, which had the same problem less visibly.

Extraction is deliberately narrow — `questions[].question` strings and nothing else.
A question rendered from a guessed field would put words in the agent's mouth, so an
unrecognised payload falls back to showing the raw arguments as before.
