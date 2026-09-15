---
'@giantswarm/backstage-plugin-agent-platform': minor
'@giantswarm/backstage-plugin-agent-platform-common': minor
---

A session whose runtime kagent cannot bring back explains itself and offers a
way on, instead of `actor "ai-…" request timed out` and the same retry forever.

A session that ends a turn by asking the person something is paused to a
snapshot on the worker's node; when that node goes away (a spot interruption,
a node roll) the next message fails after kagent's 60 s with the runtime's
words, and so does every retry. The page now reads that failure — off the
newest turn, off the send's own error, and off the `RUNTIME_LOST` failure
kagent will record on the instance — and says in its own words that the
runtime could not be brought back, that the conversation stays readable and
nothing is missing from the transcript, and offers **Start a new session with
&lt;agent&gt;** beside Send, carrying the box's text or the message that never
got its answer. The failed-turn entry says whose failure it is and keeps the
runtime's text as the evidence. Once kagent reports the loss, the header, the
Sessions list and the switcher rail mark the session, the new session takes
Send's place (and Enter), and the answer panel yields to it. A delete that
fails on such a session says why (kagent suspends the runtime before removing
the instance, and that runtime cannot be reached) and what fixes it.

The common package gains `readRuntimeLoss` and its readers, so every surface
agrees on what it is looking at.
