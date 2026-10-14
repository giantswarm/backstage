---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

Answering an agent's confirmation no longer fails with an error 500 when the
resumed turn takes longer than the request timeout (ten seconds by default) to
produce its first event. The stream stays open and relays the turn when the
agent gets going, and a turn reported still running before its stream opens is
answered 202 on both streaming routes, which the page follows through the
conversation poll.
