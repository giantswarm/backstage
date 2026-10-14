---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

Deleting a session right after its last turn ended no longer fails with a 409
"not yet settled". kagent refuses the delete until the turn's cleanup has
settled, so the backend retries exactly that refusal with a doubling backoff
for up to about 16 s, and the delete dialog says what it is waiting for once
the delete runs longer than 2 s. A session still unsettled after the retries
answers the 409 with kagent's reason and a hint to try again; every other
failure is reported as before.
