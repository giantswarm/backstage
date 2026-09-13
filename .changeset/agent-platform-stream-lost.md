---
'@giantswarm/backstage-plugin-agent-platform': patch
---

A session page no longer stays on "Working…" for good when the turn's live
stream dies although the task has completed. When the stream ends before it has
delivered the end of the turn — cut by an intermediary such as Envoy Gateway's
default 15 s route timeout, closed with an error, or hanging open after the
task finished — the page treats it as **lost** rather than as still working: the
row under the conversation says "The live stream was lost. Checking the result…"
while the conversation is re-read, then "Still working; the reply appears when
the turn finishes" if the task really is still running, and shows the finished
turn as **Completed** with its full answer, no reload needed, as soon as the
poll reports it. A stream still open when the poll already shows its task over
is aborted, so a hung request can no longer hold the page. Stop stays available
throughout, and a task that is genuinely running is never shown as finished.
