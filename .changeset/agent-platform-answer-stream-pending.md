---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

Answering an agent's confirmation no longer fails with an error 500 when the
resumed turn takes longer than the backend waits for its first event. Both
streaming routes answer such a turn 202, as the non-streaming routes do, and
the page shows the turn as still running and picks up the reply from the
conversation poll.
