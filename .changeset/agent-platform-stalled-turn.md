---
'@giantswarm/backstage-plugin-agent-platform': minor
---

The session page no longer goes silent on a turn that never lands.

A turn that outlived the send's transport and then stalled — on the kagent API
v2 line, an answer's turn cancelled at the caller's 30 s deadline and left
`submitted` with no later event — used to drop the page to an empty, enabled
composer once the "Working…" indicator's age bound expired, while kagent still
refused every new message as a conflict with the active task. Now:

- The newest `submitted`/`working` task keeps the "Working…" row; once its
  timestamp has not advanced for the 5-minute bound the row becomes **stalled**
  ("The agent has not reported progress since HH:MM") with a _Cancel the turn_
  action. Cancelling ends the turn server-side and puts the message that turn
  never answered back into the composer as a draft, so it can be sent again. The
  composer's Send stays withheld while the task is active and its caption says
  why; the page never falls back to an idle composer over a busy session.
- A send refused with a 409 renders "This session is still working on the
  previous turn" with the same _Cancel the turn_ action, instead of a generic
  "Message not sent".
- Answering a confirmation streams the resumed turn (`…/answer/stream`,
  `SendStreamingMessage`) like a message does: the answer panel gives way to
  the working composer on the stream's first event, the agent's reaction
  previews live, a cut stream is visible as such, and no deadline of the
  portal's bounds the agent's turn. The message and answer paths share one
  stream fold (`useStreamedTurn`).
