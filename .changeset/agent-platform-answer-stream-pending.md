---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

Answering an agent's confirmation no longer fails with an error 500 when the
resumed turn takes longer than the request timeout (ten seconds by default) to
produce its first event. The answer is reported as still running (a 202, as on
the non-streaming routes), the turn keeps running, and the page follows it
through the conversation poll. Both streaming routes answer a turn reported
still running with a 202 rather than a 500.
