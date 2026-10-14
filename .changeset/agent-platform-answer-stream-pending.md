---
'@giantswarm/backstage-plugin-agent-platform': patch
'@giantswarm/backstage-plugin-agent-platform-backend': patch
---

Answering an agent's confirmation no longer fails with an error 500 when the
resumed turn takes longer than ten seconds to produce its first event. The
streaming routes answer at once and keep a silent turn's stream alive with
keep-alive comments, so the reply streams in live when the agent gets going. A
refusal before the first event still reaches the page as the error its status
names.
