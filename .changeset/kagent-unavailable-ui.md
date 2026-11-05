---
'@giantswarm/backstage-plugin-agent-platform': patch
---

Say when kagent is temporarily unavailable, and do not show an empty session
list while it is. A message sent while kagent's controller cannot be reached
(its gateway answers gRPC `Unavailable`) is reported as "The Agent Platform is
temporarily unavailable. Try again in a moment." in place of "failed with
status 500", and its text stays in the composer to send again. Other writes
use the same words. A session list that could not be read is no longer shown
as "No sessions yet": the Sessions page shows the error with the reason
("temporarily unavailable") and a Try again button, the session rail says
"Could not read your sessions." with Try again, and an agent's Sessions tab
shows the same error card in place of its one-line note.
